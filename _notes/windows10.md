---
layout: post
title: "【笔记】Windows 10 装机遇到的一些问题"
date: 2020-01-16
---

最近给家里人装系统，因为 Win7 微软不再维护，所以装 Win10，这里就记录下 Win10 安装遇到的问题，日后给人装系统可以留作参考。

## 安装
要装原版系统很简单，微软官方提供 Win 10 [镜像下载](https://www.microsoft.com/zh-cn/software-download/windows10ISO)，甚至还提供 U 盘安装工具制作，建议就直接用官方的制作，或者将镜像下载下来后用 [rufus](http://rufus.ie/) 制成纯净的 U 盘启动盘。

最好不要用什么 PE 系统安装，因为市面上那些装机用的 PE 系统都夹带了私货，你用他们的安装工具安装原版系统，也会被强制装上很多垃圾软件。

## Realtek 高清晰音频管理器
装完后，大部分情况下（可能是老平台的缘故，这里是 H81 平台），你会发现前置音频口插耳机没反应，老司机都知道要在 Realtek 高清晰音频管理器中 **禁用前面板检测**，然而，你会发现不管在控制面板还是在开始菜单，或者是 C 盘程序安装目录下，都 **找不到 Realtek 高清晰音频管理器。**

我也试了网上说的一些方法，最后发现用 **驱动精灵** 重新安装音频驱动这种方法是奏效的，用 **360 驱动大师** 安装的驱动不好使。

## 输入法切换
Win 10 将输入法切换快捷键改成了 Win + Space，不是 Win 7 惯用的 Ctrl + Space。修改办法如下。（方法完全来源于 [吾爱破解的这篇帖子](https://www.52pojie.cn/thread-1002579-1-1.html)）

1. 安装 [AutoHotKey](https://www.autohotkey.com/)
2. 桌面右键新建一个 ahk 文件
3. 输入脚本内容（见下）
4. 用安装后的 AutoHotKey 的 ahk convert to exe 程序将脚本编译为 exe 文件
5. Win + R 运行 shell:startup，将生成的 exe 拖进去即可实现每次开机启动

脚本内容：

```
#SingleInstance Ignore // 防止多次运行
#NoTrayIcon // 隐藏托盘图标
^Space::#Space // 将 Ctrl + Space 映射为 Win + Space
```

## Windows Security 托盘图标隐藏
任务管理器的 **启动** 标签页，禁止 Windows Security Icon 启动即可。

## 桌面刷新慢的问题
微软惯出来的坏毛病，没事就喜欢在桌面右键点刷新，如果刷新速度慢的话，是无法忍受的。刚装完系统的刷新速度是没问题的，微软还没慢到这种地步。如果发现刷新变慢了，一定是安装的第三方软件造成的。思路就是排除法揪出这个第三方软件。

排除的方法是使用 Clean Boot。所谓 Clean Boot 就是将第三方软件全禁用然后重启。排除方法是进入 Clean Boot 后一个一个启用第三方软件，每启用一个就重启一次观察，直到刷新变慢为止。

进入 Clean Boot 的具体方法是，Win + R 运行 msconfig 打开配置对话框，在 **服务** 标签页勾选 **隐藏微软服务**，然后 **禁用所有**。在 **启动** 标签页将所有启动项都禁止。此时系统的状态即为所谓 Clean Boot 状态。

经过我排查，最后只有 360 的主动防御无法禁用，其它全禁用后刷新仍然慢，所以确定是 360 的问题，卸载后刷新果然变快，于是把 360 换成了火绒。

排查出来拖慢速度的列在这：
1. 360（卸载换火绒，或者用自带的 Windows Defender）
2. alibaba pc safe service（装阿里系的软件就会有，服务无法停止。解决方法是结束进程，然后进入程序目录，用空文件替代可执行文件，并设为只读）
