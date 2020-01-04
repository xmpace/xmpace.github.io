---
layout: post
title: "移动设备的 Bootloader"
excerpt: "最近玩路由器，对于 Bootloader 有一些认识，总结下"
---

不管玩路由器还是安卓设备，玩机的机友们都会遇到一个绕不开的问题 —— Bootloader 解锁。

## Bootloader 是什么？
移动设备的 Bootloader 跟 PC 上的 Bootloader 一样，也是用来 boot 内核的软件。

拿 PC 来说，首先 CPU 上电后会先执行 BIOS 初始化程序。BIOS 初始化完成后，会将硬盘第一个扇区的数据 (MBR) 取到内存中，然后跳转去执行 MBR 的代码。

但 MBR 毕竟大小有限，只有区区一个扇区 512 字节的大小，要把所有的启动代码放在里面不太可能（更何况 MBR 的后面部分还有分区表占去了一部分空间），所以，MBR 中一般只做一个初始的启动，从其它扇区中去将更多的启动代码取到内存中，然后跳转到这段功能更丰富的启动程序中执行。

一般 PC 上的 Bootloader，我们指的是这段功能更丰富的启动程序，如 PC 上常见的 GRUB。

Bootloader 的主要功能就是加载内核，然后将控制权转交给内核。

而移动设备上的 Bootloader 与 PC 上的类似，但略有不同，后面细说。

## Bootloader 锁是什么？
前面说了，Bootloader 是用来启动系统的，那万一设备上的系统被别有用心的人做过手脚，里面含病毒什么的，Bootloader 也直接启动吗？

这里得说一下移动设备更新系统的原理，拿安卓举例。

安卓厂商自己也是有更新系统的需求的，那这个更新是怎么实现的呢？其实就是将更新包下载到手机，然后重启进入 Bootloader 后，由 Bootloader 的程序（这里先不区分 Fastboot 和 Recovery 了，就先简单理解为都是 Bootloader 的程序，后面再细说）负责将更新包刷入手机，即完成了更新。

考虑到为了更好的安全性，Bootloader 启动的时候会对系统做校验，验证一下这个系统是不是厂家自己的正经系统，如果不是，就拒绝启动。

既然你厂商可以通过 Bootloader 更新系统，那其它人也可以，把你的更新包换成我的就行了。

这个 Bootloader 的锁就是用来做这个事的，防止非本厂商的系统启动运行。

简单点说，被锁住的 Bootloader 只认自家的系统。

其实大家也能猜到，Bootloader 锁，肯定就只是一个标志位而已，判断这个标志位，就知道是不是锁住了。那显然，这个标志位不能暴露给别人，至少不能被除 Bootloader 以外的程序所修改，包括启动后的系统也是不应该有修改的权限的。

那这样，这把锁其实就很安全了。因为 Bootloader 锁住了，你只能启动厂家的系统，而厂家的系统又不具备解锁 Bootloader 的能力。于是，只有官方一条渠道能解锁刷机了。

由此可见，想要刷机安装第三方的系统，解锁 Bootloader 是必经之路。

顺便说一句，不是所有厂商都支持解锁的，华为以前支持，后来不支持了，不过有万能的淘宝，这些都可以无视。

## 安卓的 Bootloader
上面只是大概说了一下 Bootloader，讲得比较笼统，这节稍微深入研究下安卓的 Bootloder。

<img src="/img/posts/bootloader-r1.png" os="mac" alt="安卓的一般启动流程"/>

*PS: 图片来源于 [Android Internals](http://newandroidbook.com/AIvI-M-RL1.pdf) Figure 3-1*

上电后，机器从 BootROM 开始运行，这个可以类比 PC 的 BIOS。BootROM 存在专用的只读存储中，一般也很小，只能包含基本的初始化代码，然后 BootROM 会加载并运行 SBL (Secondary Boot Loader)，SBL 一般存在通用的存储中，可以做更多复杂的初始化工作（比如，显示开机画面），主要是硬件的初始化。

SBL 初始化完成后，开始加载并执行 aboot (Android BootLoader)，aboot 做啥呢？我们前面提到的 Bootloader 锁就在这里登场了。

aboot 会去加载 bootimg，如果有 Bootloader 锁，则会去校验 bootimg 的签名，通过则启动，不通过则不能启动。

如果没有 Bootloader 锁，就不管三七二十一直接启动了。

aboot 还支持 Fastboot 模式，一般按手机组合键，可以引导 aboot 进入该模式，该模式下，可以通过 USB 口与设备进行 fastboot 协议通讯。解锁一般就是在该模式下进行操作。

aboot 还支持 Recovery 模式，不过与其说是 aboot 支持 Recovery 模式，不如说是 aboot 可以引导到 Recovery 系统。因为 Recovery 就是一个小型的系统，可以做一些刷机的操作，而且，Recovery 独立安装在一个分区，跟系统是一样的，也是可以刷成第三方的（比如 TWRP ）。Recovery 的进去方式一般也是通过组合键引导 aboot 进入。

由此可见，安卓的 Bootloader 应该是 BootROM + SBL + aboot。

从网上的公开资料来看，aboot 应该在一个独立分区中，并且是可以 dump 出来的，但我的小米 note3 试了网上的所有方法，死活找不到 aboot 的分区，猜测可能是小米有意隐藏了。原则上，这块地方应该也是可以刷的，但既然找都找不到，也就刷无可刷了。这块地方只要不刷坏，原则上手机就砖不了，因为至少可以进 Fastboot 把其它坏的地方都刷回来。如果 aboot 刷坏了，就是通常说的砖了。

网上搜了一圈，貌似没找到小米 note3 变硬砖的情况，至少都能通过线刷刷回来。

PS: aboot 的分区一般就叫 aboot，还有个 boot 分区，那是 Linux 的 boot 分区。

*更新：后来我在 /dev/block/by-name/ 目录下找到了 aboot，在小米 note3 上，aboot 分区名字叫 abl，还有个备份的 ablbak，我想，通过 dd 直接刷 abl 分区应该是可以把 aboot 刷掉的，等我哪天有空修改一下 aboot 中 unlocked 字样刷入试试。*

## 路由器的 Bootloader
路由器的 Bootloader 跟安卓的情况差不多，不同的是，大部分路由器的 Bootloader 是可写的，不像大部分安卓的 Bootloader 不可写。

路由器的 Bootloader 没有安卓的 Fastboot，不过一般会支持串口。这个串口是很多路由器救砖的基础。但串口需要 Bootloader 支持，而 Bootloader 又可刷，有刷坏的风险，因此路由器比安卓手机更容易变砖。

路由器原厂的 Bootloader 一般都很弱，所以玩家拿到手一般第一件事就是刷不死的 Bootloader，何谓不死 Bootloader 呢？其实并非真正不死，只是这种 Bootloader 带刷机界面，可以直接通过页面上传刷机包刷机，你只要是用这种 Bootloader 刷的机，那就怎么也刷不死，因为这种 Bootloader 怎么刷也不会把自己的地盘刷坏。

但你非要用 ```mtd write``` 之类的命令刷 Bootloader，那也还是能把机子刷成砖的。

砖分软砖和硬砖，软砖是说路由器系统刷坏了，但是 Bootloader 没坏，这种 Bootloader 一般是原厂的 Bootloader，不是不死那种带刷机功能的，原厂 Bootloader 又支持串口，因此，这种软砖还能通过串口来救。不过一般的路由器都不会给出串口接口来，需要拆机自己连串口 TTL 才行。

硬砖就是 Bootloader 也刷坏了，这种情况普通玩家就没得救了，只能把存储拆下来拿编程器写进去才能救。

## 电视机顶盒
电视机顶盒一般直接就是安卓系统，理论上应该跟上面说的安卓的情况一样，但我还是发现了一些有意思的东西。

比如机顶盒刷机就跟安卓手机不太一样，安卓用 Fastboot，而机顶盒用串口。

而且机顶盒的串口异常强大，即使刷成砖了，只要硬件没坏，也能通过串口来救。

以我的移动魔百盒 CM201-2 为例，该机顶盒用的海思 Hi3798M V300 的 SoC，该芯片的 [Data Sheet](http://www.hisilicon.com/-/media/Hisilicon/pdf/STB/newproduct/Hi3798MV300.pdf) 描述中有个特性：
> Boot program downloading and execution over a serial port or USB port

这个就是 ISP (In-system programming) 功能，一种无需将存储芯片（如EPROM）从嵌入式设备上取出就能对其进行编程的过程，缩略为 ISP。

ISP 通过串口发送数据给主芯片，主芯片接收完数据后暂存到内存中，之后通过 spi 接口将数据写入 flash 中。

ISP 代码固化在了在了芯片的 irom 中。启动会默认的先从uart中接收数据（第一启动顺序），如果烧录工具和芯片通信的上，就会触发 ISP 下载。如果没有就会进行第二顺序启动，即从 flash 中 load 代码。

所以，只要能拆机连串口，机顶盒也是刷不死的。

## 参考资料
http://www.newandroidbook.com/Articles/aboot.html
https://blog.csdn.net/tainjau/article/details/79200432
