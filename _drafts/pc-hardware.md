---
layout: post
title: "PC 硬件知识"
---

## boot
CPU 有一个 RESET 引脚，电脑上电后该引脚给信号后（要等供电等稳定才能给信号），CPU 才开始运行，CPU 从固定内存地址读取指令并执行，而这个固定的内存地址是映射到 BIOS 芯片的，因此，RESET 后，CPU 是直接从 BIOS 的 ROM 中读取指令并执行的，一般 BIOS 程序最开始会先初始化内存控制器（然后才可以用内存），然后将 ROM 后面压缩的 BIOS 代码解压到内存中，再 JMP 到内存去运行解压后的 BIOS 程序，原因是直接从 ROM 读取指令太慢了。

80386 及以后的 x86 处理器是从地址 FFFFFFF0h 开始运行的，这个地址一般叫 reset vector，相关资料可以查阅 Intel 的软件开发手册第三卷 9.1.4 节。

以前误以为上电后是由主板的某电路将 BIOS 的 ROM 内容先载入到内存，然后 CPU 再从内存开始读取指令并执行的。实际上并不是这样，即使是内存，它的内存控制器也是需要初始化才能用的，上电后要初始化内存控制器后才能用。初始化内存控制器是 BIOS 程序做的。

https://stackoverflow.com/questions/5300527/do-normal-x86-or-amd-pcs-run-startup-bios-code-directly-from-rom-or-do-they-cop/5347759#5347759
https://stackoverflow.com/questions/20861032/who-loads-the-bios-and-the-memory-map-during-boot-up

## 中断
网卡收到包中断，处理中断时首先会关中断，以为后面的中断会丢

## memory mapped io
通过 address decoder 来实现的

## 被主板偷走的内存能否要回来
It is also reasonable to wish to reclaim the memory from 0xA0000 to 0xFFFFF and make your RAM contiguous. Again the answer is disappointing:
Forget about it. It is likely that some of it is being used regularly by SMM or ACPI. Some of it you will probably need again, even after the machine is booted. Reclaiming pieces of it would require a significant amount of motherboard- or chipset-specific control. It is possible to write a "chipset driver" that may allow you to reclaim a little of it. However, it is almost certainly impossible to reclaim it all. The minuscule results will not be worth the effort, in general.

https://wiki.osdev.org/Detecting_Memory_(x86)

Intel 软件开发手册值得看的章节：
第一卷：
第十九章：输入/输出

第三卷：
第八章：多处理器、超线程、多核
第十章：高级可编程中断控制器
第十一章：内存缓存控制

笔记：
Local APIC 的寄存器竟然是 memory-mapped 的。
