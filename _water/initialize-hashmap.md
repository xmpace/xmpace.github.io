---
layout: post
title: "Java 的这种初始化方法你看懂了吗？"
excerpt: "匿名类的实例初始化块"
date: 2019-10-16
---

Java 中有这么一种初始化 Map 的方法，你应该见过：

```java
Map<String, String> map = new HashMap<String, String>() {
    {
        put("keyA", "valueA");
        put("keyB", "valueB");
    }
};
```

同样的，List 等其它容器也可以这样初始化，这种方式你可能也用过，但很少有人明白为啥可以这么写，这篇文章就来分析下这种语法。

首先介绍下 Java 中的初始化方式，Java 中一共有这么几种方法可以初始化：

1. 声明时初始化
```java
public class BedAndBreakfast {

    // initialize to 10
    public static int capacity = 10;

    // initialize to false
    private boolean full = false;
}
```

2. static 初始化块
```java
static {
    // whatever code is needed for initialization goes here
}
```

3. 实例初始化块
```java
{
    // whatever code is needed for initialization goes here
}
```

文章开头所见的初始化就是这第三种初始化方法，与 static 块几乎相同，只是少了 static 关键字。

Java 编译器会将 **实例初始化块** 拷贝到所有构造器中的开头位置，因此，这种方法也可以用来在多个构造器之间复用代码。

现在再回过头来解读下这段代码：

```java
Map<String, String> map = new HashMap<String, String>() {
    {
        put("keyA", "valueA");
        put("keyB", "valueB");
    }
};
```

这段代码创建了一个匿名类，匿名类继承自 HashMap<String, String>，然后这个匿名类内部有一个 **实例初始化块**，由于匿名类没有构造器，因此，在基类 HashMap 初始化完成后就会执行匿名类中的实例初始化块，此时，put 得以执行。
