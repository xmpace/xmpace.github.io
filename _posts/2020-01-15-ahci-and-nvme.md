---
layout: post
title: "AHCI 与 NVMe"
excerpt: "关于存储设备的 AHCI 与 NVMe"
---

## ATA 与 SCSI
现代磁盘主要有两种标准接口协议：ATA 指令集与 SCSI 指令集。

与磁盘通信，同样遵循 ISO 标准分层模型：物理层、链路层、传输层和应用层。

指令处于应用层。

本来，ATA 和 SCSI 都是一整套协议加接口标准，不止是指令集，还制定了物理层、链路层、传输层的规范，同时包括物理接口。

但发展过程中，涉及成本及优缺点等各方面因素，二者相互交织，再加上这两者本来就是为了操作存储外设而设计的，所以一定有相似的地方。

ATA 成本比 SCSI 低，于是 PC 产业一开始 ATA 占了主导。但 ATA 是专门为磁盘存储设计的，而 SCSI 除了磁盘存储，还被设计为能控制磁带、光驱等外设，所以 SCSI 有一些 ATA 没有的指令，比如针对磁带设备的流式数据指令、光驱的弹出指令、CD 的播放指令。于是业界整出了在 ATA 链路上跑 SCSI 指令的 ATAPI 接口。

所以，什么是 ATAPI 设备呢？如果一个磁盘，它的链路接口是 ATA 接口标准，同时应用层又支持 SCSI 指令集，那这块磁盘就是 ATAPI 设备。

后来，SCSI 也加入了特性支持在 SCSI 链路上跑 ATA 指令。

目前，似乎是 SCSI 指令占了主流，这是本人猜的，还没有去证实。（依据是目前 Windows 和 Linux 都会将 SATA 设备标识成 SCSI 设备，比如 Windows 设备管理器中，磁盘被显示为 SCSI disk device）

ATA 和 SCSI 的链路接口早期都是并行的形式，分别是 PATA (Parallel-ATA) 和 Parallel SCSI。

后来又发展成更快的串口形式，分别是 SATA (Serial-ATA) 和 SAS (Serial Attached SCSI)。

SATA 不包含应用层的指令集，它只是下三层：物理层、链路层、传输层的规范。与之对应的是 PATA。由于 SATA 的出现，ATA 便改名叫 PATA，与之对应，但也正因如此，当我们说到 PATA 的时候，不应该将其完全等价于 ATA，此时 PATA 仅仅是指链路部分，不包括 ATA 指令集。

## AHCI
伴随着 SATA 出现的，还有 AHCI (Advance Host Controller Interface)。AHCI 是 Intel 制定的主机控制器接口标准。AHCI 标准设计了一个 **AHCI 控制器** 来控制系统内存与 SATA 设备之间的数据交换。

AHCI 控制器，又叫 **host bus adapter (HBA)**，一方面，用来连接主机总线与 SATA 接口，另一方面，它封装了 SATA 设备，为主机提供了一个标准的 PCI 接口，来操作 SATA 设备。

<img src="/img/posts/ahci-and-nvme-r1.png" os="mac"/>

我一直在想，为什么在 CPU 和 SATA 设备之间需要设计这么一个 HBA 呢？IDE 时代似乎没有这个玩意？

其实不是，IDE 时代也有 HBA，只是那时的 HBA 干的活比较少，除了总线适配，IDE HBA 还有个 Master 和 Slave 的逻辑。一条 IDE cable 上可以挂两个设备，一个为 Master，一个为 Slave，当 Master 在通信时，Slave 必须等待。IDE 的 HBA 没有可编程的部分，都是纯硬件逻辑，因此对于开发者来说是透明的，在开发者看来，CPU 是直接与 IDE 设备打交道的，所以很少有人提到 IDE HBA。要注意将 IDE HBA 与 IDE Controller 区分开，IDE Controller 指的是硬盘上的芯片，是用来接收指令驱动磁头等操作的，而 HBA 一般在主板上。

到了 SATA 时代，也许是为了简化 SATA 设备的控制器设计，为 SATA 设备厂商降低成本，也可能是其它原因，一些逻辑就被放到 SATA 的 HBA 上来了，HBA 作为 SATA 设备的一层封装，可以提供更多的功能。本来 CPU 直接跟 SATA 设备打交道，有了 HBA 后，CPU 通过 HBA 跟 SATA 设备打交道，CPU 配置好 HBA 后，先将指令发给 HBA，HBA 再发指令给 SATA 设备。因此，HBA 需要给 CPU 暴露接口，AHCI 正是为了规范这个接口而提出的标准。

为什么需要制定 AHCI 标准？因为作为存储设备的咽喉部位，如果这个控制器不标准化，各个厂家生产的 HBA 接口都不一样，操作系统也就没法预先安装一个统一的驱动程序，那样的话，操作系统无法访问存储设备，启动就成问题了。

多说一句，其实在启动时，首先访问存储设备的是 BIOS，但由于 BIOS 是主板厂商提供的，而 HBA 也是主板厂商安装上去的，所以理论上主板厂商还是可以为自己的主板定制包含 HBA 驱动的 BIOS 的。这个 HBA 标准化了后，BIOS 也同样受益，只需要内置一个标准的 AHCI 驱动即可。

AHCI 标准还规定了 HBA 必须支持 ATA 和 ATAPI 设备。所以，在主板设置中，一般都能看到南桥设置中有个 SATA 控制器（其实应该叫 HBA 更合适）的设置，可以选择 AHCI 或 IDE，高级点的主板还有 RAID 选项。

有些有经验的电脑使用者，安装系统时遇到过代码为 7B 的蓝屏，原因就是安装的系统（一般是用 Ghost 安装的）中只有 IDE 驱动，而 SATA 控制器模式被设成了 AHCI 造成的，或者反过来也一样，这种情况，只要想办法将相应的驱动装好就可以解决。

后来，固态硬盘的出现，给 SATA AHCI 带来了挑战。

## NVMe
随着固态硬盘的速度越来越快，SATA 逐渐成为了瓶颈，SATA 的设计者们意识到，要满足固态硬盘的带宽需求，还按 SATA 以前那一套搞只会越来越难，所以搞出了直接用 PCIe 总线的 SATA Express，速度算是勉强跟上了，但是奈何 AHCI 不给力，对于固态硬盘来说捉襟见肘，NVMe 协议应运而生。

<img src="/img/posts/ahci-and-nvme-r2.png" os="mac"/>

看名字就知道，NVMe (Non-Volatile Memory Express) 这是专门为固态硬盘打造的。需要注意的是，NVMe 是个纯软件协议，没有 NVMe HBA 这种东西，CPU 是直接通过 PCIe 与 NVMe 设备上的 NVMe Controller 打交道的。

<img src="/img/posts/ahci-and-nvme-r3.png" os="mac"/>

前面说了 SATA Express 是直接用 PCIe 的（也可以设置为兼容 SATA 模式用 SATA），所以 NVMe 也可以跑在 SATA Express 上。

SATA 组织专门发布了白皮书 *[AHCI and NVMe as Interfaces for SATA Express<sup>TM</sup> Devices - Overview](https://sata-io.org/sites/default/files/documents/NVMe%20and%20AHCI%20as%20SATA%20Express%20Interface%20Options%20-%20Whitepaper_.pdf)* 来介绍在 SATA Express 设备上用 AHCI 和 NVMe 作为接口的情况。

<img src="/img/posts/ahci-and-nvme-4.svg"/>

左边和右边的情况不用多说。分析下中间橙色的这种情况。AHCI 驱动直接操作的是 AHCI HBA 这个设备（一个 PCIe 设备），这里直接没有 HBA 了，AHCI 驱动通过 PCIe 链路直接与 PCIe SSD 设备打交道，那显然，SSD 设备必须支持 AHCI 才行，也就是说，这种情况实际上是 AHCI HBA 放到 SSD 设备上了，与设备控制器一块组成了 AHCI Controller。

目前的市场上，走 PCIe 的 SSD，只见过支持 NVMe 协议的，没见过支持 AHCI 的，更没见过同时支持两种协议的 SSD。

## 参考资料
1. [AHCI](https://wiki.osdev.org/AHCI)  
2. [In what sense does SATA “talk” SCSI? How much is shared between SCSI and ATA?](https://unix.stackexchange.com/questions/144561/in-what-sense-does-sata-talk-scsi-how-much-is-shared-between-scsi-and-ata)  
3. [An Introduction To Programming With ATA And ATAPI](http://lateblt.tripod.com/atapi.htm)  
4. [Hard Disk Controllers: IDE, SATA (AHCI), SCSI, SAS, USB MSD, NVMe](https://docs.oracle.com/cd/E97728_01/E97727/html/harddiskcontrollers.html)  
5. [A Comparison of NVMe and AHCI](https://sata-io.org/system/files/member-downloads/NVMe%20and%20AHCI_%20_long_.pdf)  
6. [AHCI and NVMe as Interfaces for SATA Express™ Devices - Overview](https://sata-io.org/sites/default/files/documents/NVMe%20and%20AHCI%20as%20SATA%20Express%20Interface%20Options%20-%20Whitepaper_.pdf)  
7. [SATA Express](https://en.wikipedia.org/wiki/SATA_Express)  
8. [Understanding M.2, the interface that will speed up your next SSD](https://arstechnica.com/gadgets/2015/02/understanding-m-2-the-interface-that-will-speed-up-your-next-ssd/)
9. [How IDE Controllers Work](https://computer.howstuffworks.com/ide4.htm)  
10. [SCSI Host Bus Adapter Drivers](https://docs.oracle.com/cd/E19683-01/806-5222/scsihba-32898/index.html)  