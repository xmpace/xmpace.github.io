---
layout: post
title: "MacOS CLion 中完美 DEBUG OpenJDK 源码"
excerpt: "不能调试，不能代码跳转还怎么读源码？"
---

## 环境
首先，不要指望能在任意版本的系统下做到完美调试 OpenJDK，源码开发也是有系统兼容性的，有些版本的系统人家就是照顾不到，不要给自己找麻烦，先在这里 [Supported Build Platforms](https://wiki.openjdk.java.net/display/Build/Supported+Build+Platforms) 查看下官方支持的构建环境，比如 Mac OS X 10.12.6 (Sierra) + XCode / Clang 9.0，官方公布这个环境构建 JDK 9 和 10 是 Works Correctly，而我的系统正好是 Mac OS X 10.12.6 (Sierra) + XCode 9.2，所以试试构建 JDK 9（事后证明构建是 OK 的，不用将 XCode 9.2 降级到 9.0），如果 XCode 版本与官方公布版本差太多，那就建议降级了，虽然没试过，但据说降级非常简单，只要在 Application 里删掉 XCode，重新下载低版本安装就可以。

## 构建

下载 OpenJDK 9 源码，这个不多说了，自己找吧

### 编译

```bash
./configure --with-target-bits=64 --with-freetype=/usr/local/Cellar/freetype/2.10.1 --enable-ccache --with-jvm-variants=server --with-boot-jdk-jvmargs="-Xlint:deprecation -Xlint:unchecked" --with-native-debug-symbols=internal --disable-warnings-as-errors --with-debug-level=slowdebug 2>&1 | tee configure_mac_x64.log
```

注意这个选项，--with-native-debug-symbols=internal，表示在可执行文件中生成调试符号，网上有人用 external 或者 zipped 的选项，会将调试信息从可执行文件中抽出来放到单独的文件中，虽然 LLDB 和 GDB 都号称支持这种单独调试文件，然而我试验发现调试 OpenJDK 过程中会遇到各种各样的问题，不是这里断不下来就是那里断不下来，最后还是用 internal 安逸。

configure 完然后执行 make all 构建。

### 导入 CLion
先导入 jdk 目录，直接下一步，CLion 会为 jdk 目录生成 CMakeLists.txt。然后退出，再导入 hotspot 目录，直接下一步，为 hotspot 生成 CMakeLists.txt。最后导入 jdk9 根目录，直接下一步，修改 CMakeLists.txt 为如下内容：

```
cmake_minimum_required(VERSION 3.15)
project(jdk9)

set(CMAKE_CXX_STANDARD 14)

add_subdirectory(jdk)
add_subdirectory(hotspot)
```

导入完成。

### 调试

然后配置调试，debug 配置中可执行文件选 build/macosx-x86_64-normal-server-slowdebug/jdk/bin/java，删掉启动前的 build 步骤，在 jdk/src/java.base/share/native/launcher/main.c 的 main 函数打断点即可断下调试，这就是 java 的入口。

调试器 Mac 下默认是 LLDB，我试了下 GDB，发现 GDB 无法读取共享库的符号，导致共享库源码的断点断不下来，所以用了 LLDB。

调试过程中会出现 SIGSEGV 信号而导致调试不能继续进行，这是因为调试器以为程序出错了，所以捕获了这些信号，我们要配置调试器忽略这些信号。

LLDB 要忽略 SIGSEGV，可以在 main 断点处断下后，切到 CLion 的 Debug 窗口的 LLDB 下，执行 `process handle --pass true --stop false --notify true SIGSEGV`，不过这样，每次重新开始调试都要执行这条命令才行。

LLDB 有个初始化文件 ~/.lldbinit，启动时会首先执行这里面的命令，然而将上述命令直接放进文件中是没效果的，因为上面的命令必须调试目标启动后才能执行，而 LLDB 载入 .lldbinit 时，调试目标还没启动，所以用下面这种取巧的方案。

```
breakpoint set --file /Users/yema/code/git/jdk9/jdk/src/java.base/share/native/launcher/main.c --line 98 -C "process handle --pass true --stop false --notify true SIGSEGV" --auto-continue true
```

将上面的命令放到 .lldbinit 中即可，原理是每次调试开始，先在 main.c 的开始处打上断点，然后在断点处执行 `process handle --pass true --stop false --notify true SIGSEGV`，设置断点为自动跳过。

上网搜了一圈，用 main 函数的断点来实现这个是目前最好的方式了。

### 代码跳转

查看代码的时候发现很多地方报红，各种未定义，这是因为构建时，很多头文件是用相对目录定位的，我们可以从构建日志中找到编译时的头文件参数和宏定义：

```
( CCACHE_COMPRESS=1 CCACHE_SLOPPINESS=pch_defines,time_macros CCACHE_BASEDIR=/Users/xiaomi/code/git/jdk9 /usr/local/bin/ccache /usr/bin/clang -fpch-preprocess -DJAVA_ARGS='{ "-J--add-modules", "-JALL-DEFAULT", "-J-ms8m", "-m", "java.desktop/sun.applet.Main", }' -DPACKAGE_PATH='"/opt/local"' -D_LITTLE_ENDIAN -DMACOSX -D_LP64=1 -DARCH='"x86_64"' -Dx86_64 -DDEBUG -D_ALLBSD_SOURCE -D_DARWIN_UNLIMITED_SELECT -DMAC_OS_X_VERSION_MAX_ALLOWED=1070 -mmacosx-version-min=10.7.0 -I/Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/modules_include/java.base -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/macosx/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/libjava -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/libjava -g -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/launcher -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/libjli -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/libjli -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/macosx/native/libjli -DVERSION_MAJOR=9 -DVERSION_MINOR=0 -DVERSION_SECURITY=0 -DVERSION_PATCH=0 -DVERSION_PRE='"internal"' -DVERSION_BUILD=0 -DVERSION_OPT='"adhoc.xiaomi.jdk9"' -DVERSION_NUMBER='"9"' -DVERSION_STRING='"9-internal+0-adhoc.xiaomi.jdk9"' -DVERSION_SHORT='"9-internal"' -DVERSION_SPECIFICATION='"9"' -DLAUNCHER_NAME='"openjdk"' -DPROGNAME='"appletviewer"' -DJAVA_ARGS='{ "-J--add-modules", "-JALL-DEFAULT", "-J-ms8m", "-m", "java.desktop/sun.applet.Main", }' -DPACKAGE_PATH='"/opt/local"' -D_LITTLE_ENDIAN -DMACOSX -D_LP64=1 -DARCH='"x86_64"' -Dx86_64 -DDEBUG -D_ALLBSD_SOURCE -D_DARWIN_UNLIMITED_SELECT -DMAC_OS_X_VERSION_MAX_ALLOWED=1070 -mmacosx-version-min=10.7.0 -I/Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/modules_include/java.base -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/macosx/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/libjava -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/libjava -g -g -iframework /System/Library/Frameworks -F /System/Library/Frameworks/JavaVM.framework/Frameworks -O0 -DTHIS_FILE='"main.c"' -c -MMD -MF /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.d -o /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o /Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/launcher/main.c > >(/usr/bin/tee /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.log) 2> >(/usr/bin/tee /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.log >&2) || ( exitcode=$? && /bin/cp /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.log /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/make-support/failure-logs/support_native_java.desktop_appletviewer_objs_main.o.log && /bin/cp /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.cmdline /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/make-support/failure-logs/support_native_java.desktop_appletviewer_objs_main.o.cmdline && exit $exitcode ) )
```

将这些 -I 的头文件目录用 include_directories 命令加到 CMakeLists.txt 中，将 -D 定义的宏用 add_definitions 命令加到 CMakeLists.txt 中即可。

上面的步骤，要分别修改 jdk 和 hotspot 目录下的 CMakeLists.txt，不能在顶层 CMakeLists.txt 中改，因为两个子目录的构建参数不同，所以要分别配置。

#### 平台相关代码
hotspot CMakeLists.txt 中 add_executable 选项里，src/os_cpu/下只保留bsd_x86，src/os/下只保留posix,bsd，src/cpu/下只保留x86

#### 排除不相关代码
把导入的多余的 Java 代码（跟结构相关的）那些都 Exclude 掉（有些 Exclude 掉仍然会跳转过去，怀疑是 CLion 的 bug，将那些文件设置 Plain Text 可解决）。
hotspot/src/share/vm/adlc Exclude 掉。


### 小技巧
#### 找某个头文件是由哪个头文件传递引入的
在当前目录创建一个与头文件同名的文件（如果引入头文件包含路径的话要连目录结构也创建出来），内容为 `#error error`，然后用编译选项 `-I .` 编译源文件，编译器会报错，包含一个头文件引入的 Stack Trace。

#### 找某个变量是在哪里声明或定义的
在源文件中定义一个同名变量名，但类型不同，编译器会报错指出之前的定义或声明在哪。

typedef 类型定义也可以用这种方式找。

### 问题
hotspot/src/share/vm/runtime/os.hpp
该头文件包含了以下几个文件，而以下几个文件只是一些代码片段，虽然符合语法，但是缺少一些上下文定义，这些代码片段只有放在 os.hpp 文件里组成完整的代码才能编译通过，于是 CLion 对这几个文件做语法分析时就报错了，连带着 os.hpp 里一块报错了，形成了一个死循环，os_posix.hpp 由于与 os.hpp 相互包含，虽然有保护头防止被重复包含，但由于 CLion 对其语法分析时通不过，于是这些保护头可能也被 CLion 忽略了，os_posix.hpp 便死活打不开（估计也是死循环了）。

hotspot/src/share/vm/runtime/os_ext.hpp
hotspot/src/os/bsd/vm/os_bsd.hpp
hotspot/src/os_cpu/bsd_x86/vm/os_bsd_x86.hpp
hotspot/src/os/posix/vm/os_posix.hpp

暂时没有好办法，只能自己手动改代码，把那些代码片段手动复制到包含的地方后再编译。

### 缩写
pd -> Platform-dependent
NMT -> Native memory tracking
disp -> displacement
CDS -> Class Data Sharing
bcp -> byte code pointer
locals -> pointer to locals
fp -> frame pointer
sp -> stack pointer
ADLC -> Architecture Description Language Compiler

### 疑问
GuardedMemory 是用来干嘛的？
stubs 是用来做什么的？
ProfileInterpreter 是什么选项？
InterpreterBackwardBranchLimit 中的 BackwardBranch 是什么？
Arena 用来快速分配内存，预先申请一大块内存，叫 Arena，后续申请小内存就直接从这块大内存里取。
oop 普通对象指针，为了免去生成虚函数表，JVM 直接将对象实现为一个普通 class，而没有用继承去实现，new 对象时，对象的内存地址就是 oop 的值。
encode(Register)，对寄存器做 encoding，参考：https://eklitzke.org/x86-register-encoding。