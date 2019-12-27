---
layout: post
title: "x86 cache locking 的猜想（续）"
excerpt: "上一篇 cache locking 的猜想是错误的"
---

今天找到了新的资料，可以证明我在 [上一篇文章](cache-locking) 里的猜想是错误的。

[这篇 Intel 的资料](https://software.intel.com/en-us/articles/implementing-scalable-atomic-locks-for-multi-core-intel-em64t-and-ia32-architectures) 给了关于 cache locking 更多的信息：

> In the days of Intel 486 processors, the lock prefix used to assert a lock on the bus along with a large hit in performance. Starting with the Intel Pentium Pro architecture, the bus lock is transformed into a cache lock. A lock will still be asserted on the bus in the most modern architectures if the lock resides in uncacheable memory or if the lock extends beyond a cache line boundary splitting cache lines. Both of these scenarios are unlikely, so most lock prefixes will be transformed into cache lock which is much less expensive.

[Intel 的 VTune 资料](https://software.intel.com/en-us/vtune-help-bus-lock) 也有相关的信息：

> Intel processors provide a LOCK# signal that is asserted automatically during certain critical memory operations to lock the system bus or equivalent link. While this output signal is asserted, requests from other processors or bus agents for control of the bus are blocked. This metric measures the ratio of bus cycles, during which a LOCK# signal is asserted on the bus. The LOCK# signal is asserted when there is a locked memory access due to uncacheable memory, locked operation that spans two cache lines, and page-walk from an uncacheable page table.

**由此可见，现代处理器，内存模式为 write-back 时，仅当要 lock 的内存跨越了缓存行时才会在总线上发 LOCK# 信号。**

*（PS: 所以 lock 的内存最好在一个缓存行内，64 位的数据类型按 64 位对齐，32 位的数据类型按 32 位对齐即可满足要求）*

我之前的猜想，认为各个核的缓存之间无法实现全局的 lock，现在看来是错的。

仍然以上篇文章的例子做说明，当要 lock 的内存区域同时被两个核 cache 住，此时 cache line 状态为 S。

其中一个核执行原子操作时，将 cache line 锁住，这个锁，应该会把所有其它核对应的 cache line 也锁住，除了正在执行原子操作的核，其它核都不能访问这个内存对应的 cache。

我查了一下资料，在 CPU 的结构中，各个核的 cache 之间是有一条环形的 ring bus 存在的，看起来锁应该就是通过这个 bus 实现的。有一篇关于 cache locking 的[调研](https://www.researchgate.net/profile/Sparsh_Mittal/publication/286925817_A_Survey_Of_Techniques_for_Cache_Locking/links/5a3b1f2c458515a77aa8e1dd/A-Survey-Of-Techniques-for-Cache-Locking.pdf?origin=publication_detail)，介绍了 cache locking 的很多方法，但我暂时也没兴趣深挖下去，先把资料收在这。

<img src="/img/posts/cache-locking-2-1.gif" alt="Ring Bus"/>

这么一看，cache 其实跟内存完全就是一体的，各个核的 cache 和内存是能完全保持一致性的。所以以后分析的时候，可以将 cache 视作不存在，完全透明（除非你分析的就是 cache 本身）。

各个核真正私有的，除了寄存器之外，对程序员来说比较重要的就是 store buffer 了，store buffer 正是影响 CPU 内存排序模型的因素之一，另一个影响内存排序模型的因素应该是指令流水线式的执行方式。

## 关于 DMA 的一致性
上一篇文章我提了一嘴，关于 DMA 的问题，这里再展开说一下。

DMA 其实也可以看做一个核，它也会访问内存，那这时，考虑到 CPU 存在缓存的问题，就存在一个缓存一致性的问题。

比如 CPU 在缓存里修改了数据，但是没刷回内存，这时候 DMA 就会在内存中读到旧的数据。

又比如，DMA 往内存写了数据，但没通知 CPU，CPU 以为缓存中的数据还有效，于是从缓存中读到旧数据。

解法有多种，一种是维护 DMA 与 CPU 缓存的一致性，比如 DMA 往内存写数据的时候，由 CPU 去 snoop 这个写请求，然后 invalid 缓存。

但这种方法有很明显的缺点，比如 DMA 要从外设挪一大段数据到内存，就会占用总线比较多的资源。

另一种方法是，设置 DMA 的内存不进缓存，这个可以通过页表中的相应标志位（Intel SDM vol3 11.12）进行设置，这样的话，CPU 跟 DMA 都直接访问内存，不存在一致性问题，可以在 DMA 移动完数据后，再将内存设为 write-back 可缓存模式。

其实应该还存在另一种更极致的情况，DMA 与 CPU 同时访问同一块内存，这个涉及到一个原子性的问题。

比如单核 CPU 上如果不对 cmpxchg 加 lock，那么理论上这条指令就可能被 DMA 的访存操作打断，但实际编程实践中单核 CPU 并不加 lock，hotspot 里面就有这样的代码：

```
    // Atomic swap back the old header
    if (os::is_MP()) lock();
    cmpxchgptr(header_reg, Address(obj_reg, 0));
```

这是因为在编程实践中，出于对实际情况的考虑，DMA 是不会访问要加锁的内存区域的，你想想什么情况下，你会有让外设访问 lock 内存的需求呢？不存在这样的需求。当然如果你非得搞破坏，那也是能够做到的。