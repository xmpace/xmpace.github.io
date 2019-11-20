---
layout: post
title: "MacOS CLion 中完美 DEBUG OpenJDK 源码"
excerpt: "不能调试，不能代码跳转还怎么读源码？"
---

## 环境
首先，不要指望能在任意版本的系统下做到完美调试 OpenJDK，源码开发也是有系统兼容性的，有些版本的系统人家就是照顾不到，不要给自己找麻烦，先在这里 [Supported Build Platforms](https://wiki.openjdk.java.net/display/Build/Supported+Build+Platforms) 查看下官方支持的构建环境，比如 Mac OS X 10.12.6 (Sierra) + XCode / Clang 9.0，官方公布这个环境构建 JDK 9 和 10 是 Works Correctly，而我的系统正好是 Mac OS X 10.12.6 (Sierra) + XCode 9.2，所以试试构建 JDK 9（事后证明构建是 OK 的，不用将 XCode 9.2 降级到 9.0），如果 XCode 版本与官方公布版本差太多，那就建议降级了，虽然没试过，但据说降级非常简单，只要在 Application 里删掉 XCode，重新下载低版本安装就可以。

## 构建

下载 OpenJDK 9 源码，这个不多说了，自己找吧

```bash
./configure --with-target-bits=64 --with-freetype=/usr/local/Cellar/freetype/2.10.1 --enable-ccache --with-jvm-variants=server --with-boot-jdk-jvmargs="-Xlint:deprecation -Xlint:unchecked" --with-native-debug-symbols=internal --disable-warnings-as-errors --with-debug-level=slowdebug 2>&1 | tee configure_mac_x64.log
```

注意这个选项，--with-native-debug-symbols=internal，表示在可执行文件中生成调试符号，网上有人用 external 或者 zipped 的选项，会将调试信息从可执行文件中抽出来放到单独的文件中，虽然 LLDB 和 GDB 都号称支持这种单独调试文件，然而我试验发现调试 OpenJDK 过程中会遇到各种各样的问题，不是这里断不下来就是那里断不下来，最后还是用 internal 安逸。

configure 完然后执行 make all 构建。

CLion 直接导入 JDK 源码根目录，直接下一步，然后 debug 配置中可执行文件选 build/macosx-x86_64-normal-server-slowdebug/jdk/bin/java，删掉启动前的 build 步骤，在 jdk/src/java.base/share/native/launcher/main.c 的 main 函数打断点即可断下调试，这就是 java 的入口。

调试器 Mac 下默认是 LLDB，我试了下 GDB，发现 GDB 无法读取共享库的符号，导致共享库源码的断点断不下来，所以用了 LLDB。

调试过程中会出现 SIGSEGV 信号而导致调试不能继续进行，这是因为调试器以为程序出错了，所以捕获了这些信号，我们要配置调试器忽略这些信号。

LLDB 要忽略 SIGSEGV，可以在 main 断点处断下后，切到 CLion 的 Debug 窗口的 LLDB 下，执行 `process handle --pass true --stop false --notify true SIGSEGV`，不过这样，每次重新开始调试都要执行这条命令才行。

LLDB 有个初始化文件 ~/.lldbinit，启动时会首先执行这里面的命令，然而将上述命令直接放进文件中是没效果的，因为上面的命令必须调试目标启动后才能执行，而 LLDB 载入 .lldbinit 时，调试目标还没启动，所以用下面这种取巧的方案。

```
breakpoint set --file /Users/yema/code/git/jdk9/jdk/src/java.base/share/native/launcher/main.c --line 98 -C "process handle --pass true --stop false --notify true SIGSEGV" --auto-continue true
```

将上面的命令放到 .lldbinit 中即可，原理是每次调试开始，先在 main.c 的开始处打上断点，然后在断点处执行 `process handle --pass true --stop false --notify true SIGSEGV`，设置断点为自动跳过。

上网搜了一圈，用 main 函数的断点来实现这个是目前最好的方式了。

查看代码的时候发现很多地方报红，各种未定义，这是因为构建时，很多头文件是用相对目录定位的，我们可以从构建日志中找到编译时的头文件参数和宏定义：

```
( CCACHE_COMPRESS=1 CCACHE_SLOPPINESS=pch_defines,time_macros CCACHE_BASEDIR=/Users/xiaomi/code/git/jdk9 /usr/local/bin/ccache /usr/bin/clang -fpch-preprocess -DJAVA_ARGS='{ "-J--add-modules", "-JALL-DEFAULT", "-J-ms8m", "-m", "java.desktop/sun.applet.Main", }' -DPACKAGE_PATH='"/opt/local"' -D_LITTLE_ENDIAN -DMACOSX -D_LP64=1 -DARCH='"x86_64"' -Dx86_64 -DDEBUG -D_ALLBSD_SOURCE -D_DARWIN_UNLIMITED_SELECT -DMAC_OS_X_VERSION_MAX_ALLOWED=1070 -mmacosx-version-min=10.7.0 -I/Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/modules_include/java.base -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/macosx/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/libjava -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/libjava -g -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/launcher -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/libjli -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/libjli -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/macosx/native/libjli -DVERSION_MAJOR=9 -DVERSION_MINOR=0 -DVERSION_SECURITY=0 -DVERSION_PATCH=0 -DVERSION_PRE='"internal"' -DVERSION_BUILD=0 -DVERSION_OPT='"adhoc.xiaomi.jdk9"' -DVERSION_NUMBER='"9"' -DVERSION_STRING='"9-internal+0-adhoc.xiaomi.jdk9"' -DVERSION_SHORT='"9-internal"' -DVERSION_SPECIFICATION='"9"' -DLAUNCHER_NAME='"openjdk"' -DPROGNAME='"appletviewer"' -DJAVA_ARGS='{ "-J--add-modules", "-JALL-DEFAULT", "-J-ms8m", "-m", "java.desktop/sun.applet.Main", }' -DPACKAGE_PATH='"/opt/local"' -D_LITTLE_ENDIAN -DMACOSX -D_LP64=1 -DARCH='"x86_64"' -Dx86_64 -DDEBUG -D_ALLBSD_SOURCE -D_DARWIN_UNLIMITED_SELECT -DMAC_OS_X_VERSION_MAX_ALLOWED=1070 -mmacosx-version-min=10.7.0 -I/Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/modules_include/java.base -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/macosx/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/include -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/libjava -I/Users/xiaomi/code/git/jdk9/jdk/src/java.base/unix/native/libjava -g -g -iframework /System/Library/Frameworks -F /System/Library/Frameworks/JavaVM.framework/Frameworks -O0 -DTHIS_FILE='"main.c"' -c -MMD -MF /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.d -o /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o /Users/xiaomi/code/git/jdk9/jdk/src/java.base/share/native/launcher/main.c > >(/usr/bin/tee /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.log) 2> >(/usr/bin/tee /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.log >&2) || ( exitcode=$? && /bin/cp /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.log /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/make-support/failure-logs/support_native_java.desktop_appletviewer_objs_main.o.log && /bin/cp /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/support/native/java.desktop/appletviewer_objs/main.o.cmdline /Users/xiaomi/code/git/jdk9/build/macosx-x86_64-normal-server-slowdebug/make-support/failure-logs/support_native_java.desktop_appletviewer_objs_main.o.cmdline && exit $exitcode ) )
```

将这些 -I 的头文件目录用 include_directories 命令加到 CMakeLists.txt 中，将 -D 定义的宏用 add_definitions 命令加到 CMakeLists.txt 中即可。