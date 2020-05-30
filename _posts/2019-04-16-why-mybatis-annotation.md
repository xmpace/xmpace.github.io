---
layout: post
title: "为什么 MyBatis Annotation 必须在注解中写参数名？"
excerpt: "Spring MVC 却不需要呢？"
---

```java
public interface UserMapper {
    @Select("SELECT * FROM user WHERE age = #{age} AND name = #{name}")
    User selectByAgeAndName(@Param("age") Integer age, @Param("name") String name);
}
```

比如上面这个 Mapper，我必须通过 @Param 注解来指定参数 age 和 name 的名字，才可以在 SQL 中引用这些参数，否则的话就会报如下异常：

```log
org.apache.ibatis.binding.BindingException: Parameter 'age' not found. Available parameters are [arg1, arg0, param1, param2]
  at org.apache.ibatis.binding.MapperMethod$ParamMap.get(MapperMethod.java:204) ~[mybatis-3.4.6.jar:3.4.6]
  at org.apache.ibatis.reflection.wrapper.MapWrapper.get(MapWrapper.java:45) ~[mybatis-3.4.6.jar:3.4.6]
  at org.apache.ibatis.reflection.MetaObject.getValue(MetaObject.java:122) ~[mybatis-3.4.6.jar:3.4.6]
  at org.apache.ibatis.executor.BaseExecutor.createCacheKey(BaseExecutor.java:219) ~[mybatis-3.4.6.jar:3.4.6]
  ...
```

我已经将参数名命名为 age 和 name，为什么还要多此一举用注解指定这两个参数的名字才能使用呢？就不能像下面这样吗？

```java
public interface UserMapper {
    @Select("SELECT * FROM user WHERE age = #{age} AND name = #{name}")
    User selectByAgeAndName(Integer age, String name);
}
```

毕竟，我们在用 Spring MVC 的时候，在 Controller 里面就是这么用的啊！

```java
@RestController
public class HelloController {
    @GetMapping("/hello")
    public String hello(String name) {
        return name;
    }
}
```

比如这个接口，name 就是一个可选参数，当我们访问 http://localhost:8080/hello?name=obama 的时候，它会返回 obama，那么这又是怎么实现的呢？是否能通过反射拿呢？
JDK 的 Executable.getParameters 的确可以拿到正式的参数名，而类 Method 和 Constructor 都继承自 Executable，所以，通过反射，应该是可以拿到正式参数名的。然而 .class 文件默认是不存储正式参数名的，因为这会导致 .class 文件中存储过多的信息，加载类的时候也会占用更多的 JVM 内存，所以，默认情况下，通过反射是拿不到参数名的。如果你想将参数名存到 .class 文件中，可以通过 javac 的 -parameters 参数来实现。

从Spring源码中也能得到证实：

```java
public String[] getParameterNames(Method method) {
    for (ParameterNameDiscoverer pnd : this.parameterNameDiscoverers) {
        String[] result = pnd.getParameterNames(method);
        if (result != null) {
            return result;
        }
    }
    return null;
}
```

其中 this.parameterNameDiscoverers 是个数组，里面有两个元素

<img src="/img/posts/why-mybatis-annotation-r1.png" os="mac"/>

顾名思义，一个是通过反射来找参数名，一个是通过 Local Variable Table 来找参数名。通过反射拿参数名：

<img src="/img/posts/why-mybatis-annotation-r2.png" os="mac"/>

通过反射拿不到，拿到的是一个 arg0 的参数名，并且 param.isNamePresent 也会返回 false。

所以答案显而易见了，Spring 是通过 Local Variable Table 来拿的：

```java
private Map<Member, String[]> inspectClass(Class<?> clazz) {
    InputStream is = clazz.getResourceAsStream(ClassUtils.getClassFileName(clazz));
    ...
    try {
        ClassReader classReader = new ClassReader(is);
        Map<Member, String[]> map = new ConcurrentHashMap<>(32);
        classReader.accept(new ParameterNameDiscoveringVisitor(clazz, map), 0);
        return map;
    }
    ...
}
```

直接读取类文件，然后通过 ClassReader（底层是通过 asm 字节码库）来获取 .class 文件中的 Local Variable Table 中的变量名的。

好了，现在至少我们找到了一种获取变量名的方法，那能不能应用到 MyBatis 中呢？如果 MyBatis 也能从 Local Variable Table 中读到变量名，那就方便了！

然而现实给我们泼了一瓢冷水，因为 MyBatis 的 Mapper 是通过接口来实现的，而接口的抽象方法由于没有方法体，根据 JVM 标准对 class 文件的规范，也不会保留 Local Variable Table，因此我们也就无法拿到参数名了。