---
layout: post
title: "Maven 依赖不兼容如何处理"
excerpt: "Maven 依赖不兼容的解决办法"
background: /img/bg-post.jpg
redirect_from:
  - /special-maven-conflicts
  - /special-maven-conflicts.html
---

Maven 依赖冲突如何处理估计大家都烂熟于心了，但有一种 Maven 依赖冲突你可能没遇到过。让我来举个例子。

## 问题
weird-lib 1.0 版的代码是这样的，里面只有一个 foo 函数
```java
public class WeirdClass {
  public static String foo() {
    ...
  }
}
```

后来开发者发布了 2.0 版本，里面增加了一个 advancedFoo 函数，它是 foo 函数的升级版，foo 被打上了 Deprecated 注解。
```java
public class WeirdClass {
  @Deprecated
  public static String foo() {
    ...
  }

  public static String advancedFoo () {
    ...
  }
}
```

weird-lib 一直在迭代，等发布 10.0 版本的时候，已经是几年后了，10.0 版本新增了很多新特性，同时还删掉了一些被弃用的代码，这其中就包括 foo 函数，毕竟它已经被打上 Deprecated 注解很久很久了。
```java
public class WeirdClass {
  public static String advancedFoo () {
    ...
  }
}
```

好了，以上是背景，问题来了，如下的情况应该选择使用 weird-lib 的哪个版本呢？

<img src="/img/posts/special-maven-conflicts-r1.png" os="mac"/>

很明显：**选哪个都不行！**

这是显而易见的嘛，如果你指定 weird-lib 为 2.0，那么 weird-lib 中就没有 advancedFoo 方法，B 会报 NoSuchMethod 的错误。如果你指定 weird-lib 为 10.0 版本，那么 weird-lib 中就没有 foo 方法，A 又会报 NoSuchMethod 的错误。

上面这个问题其实就是 **依赖不兼容** 造成的，稍有经验的 Java 后端程序员可能都碰到过，比如 Protobuf 2 与 Protobuf 3 就不兼容，Thrift 0.8.0 与 Thrift 0.9.1 也不兼容。如果，某个服务是用 Thrift 0.8.0 开发的，另一个服务是用 Thrift 0.9.1 开发的，那么，你想在你的应用中同时调用这两个服务就会碰到上面提到的依赖不兼容问题。

## 解决方法
这种依赖不兼容的问题可以通过 Class Loader 隔离来解决。

我们知道，在 Java 中，同一个类可以被不同的 Class Loader 装载，装载后的类对象是独立的，因此，利用这个特性就可以做到类隔离。

在这个 case 里，我们可以用一个自定义的 Class Loader 装载 weird-lib 2.0，用另一个 Class Loader 装载 weird-lib 10.0，这样，weird-lib 的不同版本的类对象就可以同时存在 JVM 中了，当然，我们业务代码的 Class Loader 也需要定制，以便业务代码可以访问到这两个位于不同 Class Loader 中的类。

借助蚂蚁金服开源的 SOFAArk 可以轻松地做到上面这些事。

*（注：以下介绍主要来源于 SOFAArk 官网，我适当做了删减和说明）*

SOFAArk 是一款基于 Java 实现的轻量级类隔离容器，可以帮助解决依赖包冲突。

SOFAArk 包含三个概念，Ark Container, Ark Plugin 和 Ark Biz。运行时逻辑结构图如下：

<img src="/img/posts/special-maven-conflicts-r2.png" os="mac"/>

**Ark Container:** SOFAArk 容器，一句话描述就是，它是用来做 Class Loader 隔离的框架。

**Ark Plugin:** Ark 插件，使用官方提供的 Maven 插件 sofa-ark-plugin-maven-plugin 可以将普通的 Java jar 打包成一个标准格式的 Ark Plugin。运行时，SOFAArk 容器会使用独立的 PluginClassLoader 加载插件，使插件和插件之间、插件和应用之间相互隔离。

**Ark Biz:** Ark 应用模块，使用官方提供的 Maven 插件 sofa-ark-maven-plugin 可以将工程应用打包成一个标准格式的 Ark Biz。Ark Biz 是用来与插件交互的部分，因为 Plugin 已经被 PluginClassLoader 隔离开了，如果想访问里面的类，访问代码本身的 ClassLoader 也必须跟 PluginClassLoader 打通才可以。所以就把需要访问 Plugin 的部分打包成 Biz。

这么说可能没概念，看张图就知道了。

<img src="/img/posts/special-maven-conflicts-r3.png" os="mac"/>

对应到我们之前的 case，就是把 Dependency A 和 Dependency B 分别打包成包含 Weird 相应版本的 Ark Plugin，将原 Project 打包成 Ark Biz。

Ark Container 先启动，容器从 classpath 中自动解析 Ark Plugin 和 Ark Biz，并读取他们的配置信息，构建类和资源的加载索引表，然后使用独立的 ClassLoader 加载并按优先级配置依次启动。Ark Plugin 会优先于 Ark Biz 被加载启动，Ark Plugin 之间是双向类索引关系，即可以相互委托对方加载所需的类和资源，Ark Plugin 和 Ark Biz 是单向类索引关系，即只允许 Ark Biz 索引 Ark Plugin 加载的类和资源，反之则不允许。