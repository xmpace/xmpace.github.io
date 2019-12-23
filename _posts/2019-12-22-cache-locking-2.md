---
layout: post
title: "x86 cache locking 的猜想（续）"
excerpt: "上一篇 cache locking 的猜想是错误的"
---

今天找到了新的资料，可以证明我在上一篇文章里的猜想是错误的。

[这篇 Intel 的资料](https://software.intel.com/en-us/articles/implementing-scalable-atomic-locks-for-multi-core-intel-em64t-and-ia32-architectures) 给了关于 cache locking 更多的信息：

> In the days of Intel 486 processors, the lock prefix used to assert a lock on the bus along with a large hit in performance. Starting with the Intel Pentium Pro architecture, the bus lock is transformed into a cache lock. A lock will still be asserted on the bus in the most modern architectures if the lock resides in uncacheable memory or if the lock extends beyond a cache line boundary splitting cache lines. Both of these scenarios are unlikely, so most lock prefixes will be transformed into cache lock which is much less expensive.

[Intel 的 VTune 资料](https://software.intel.com/en-us/vtune-help-bus-lock)也有相关的信息：

> Intel processors provide a LOCK# signal that is asserted automatically during certain critical memory operations to lock the system bus or equivalent link. While this output signal is asserted, requests from other processors or bus agents for control of the bus are blocked. This metric measures the ratio of bus cycles, during which a LOCK# signal is asserted on the bus. The LOCK# signal is asserted when there is a locked memory access due to uncacheable memory, locked operation that spans two cache lines, and page-walk from an uncacheable page table.

**由此可见，现代处理器，内存模式为 write-back 时，仅当要 lock 的内存跨越了缓存行时才会在总线上发 LOCK# 信号。**

我之前的猜想，认为各个核的缓存之间无法实现全局的 lock，现在看来是错的。

仍然以上篇文章的例子做说明，当要 lock 的内存区域同时被两个核 cache 住，此时 cache line 状态为 S。

其中一个核执行原子操作时，将 cache line 锁住，这个锁，应该会把所有其它核对应的 cache line 也锁住，除了正在执行原子操作的核，其它核都不能访问这个内存对应的 cache。

我查了一下资料，在 CPU 的结构中，各个核的 cache 之间是有一条环形的 ring bus 存在的，看起来锁应该就是通过这个 bus 实现的。有一篇关于 cache locking 的[调研](https://www.researchgate.net/profile/Sparsh_Mittal/publication/286925817_A_Survey_Of_Techniques_for_Cache_Locking/links/5a3b1f2c458515a77aa8e1dd/A-Survey-Of-Techniques-for-Cache-Locking.pdf?origin=publication_detail)，介绍了 cache locking 的很多方法，但我暂时也没兴趣深挖下去，先把资料收在这。

<img src="/img/posts/cache-locking-2-1.gif" alt="Ring Bus"/>

这么一看，cache 其实跟内存完全就是一体的，各个核的 cache 和内存是能完全保持一致性的。所以以后分析的时候，可以将 cache 视作不存在，完全透明（除非你分析的就是 cache 本身）。

各个核真正私有的，除了寄存器之外，对程序员来说比较重要的就是 store buffer 了，store buffer 正是影响 CPU 内存排序模型的因素之一，另一个影响内存排序模型的因素应该是指令流水线式的执行方式。

下一篇文章就好好分析一下 CPU 的内存排序模型。