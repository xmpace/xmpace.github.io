---
layout: post
title: "OpenJDK 9 的 make 过程分析"
---

在源码根目录执行 ./configure -xxxx ，会调用到 common/autoconf/ 目录中的脚本，执行流程是：
./configure --> common/autoconf/configure --> common/autoconf/generated-configure
最后这个脚本，不论是从名字看还是从文件内容开头的注释，都可看出是自动生成的脚本，它是由 autoconf 根据 common/autoconf/configure.ac 生成的。

[这篇文章](https://www.gnu.org/software/autoconf/manual/autoconf-2.67/html_node/Making-configure-Scripts.html) 用图介绍了这些文件是怎么生成的。

