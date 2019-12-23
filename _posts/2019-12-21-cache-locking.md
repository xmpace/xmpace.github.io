---
layout: post
title: "x86 cache locking 的猜想"
excerpt: "问题来源于知乎的一篇帖子"
---

问题来源于知乎的一篇帖子：
浅论Lock 与X86 Cache 一致性 - wiles super的文章 - 知乎
https://zhuanlan.zhihu.com/p/24146167

该帖子对于原子命令 cmpxchg 的分析引起了我的好奇心。

我原来对 cmpxchg 的原子性的理解没考虑 CPU Cache，只考虑了 CPU 直接访问内存的情况。而这篇知乎的帖子，讨论的是内存已经在 CPU Cache 中的情况。

先说说我原来的理解。

cmpxchg 本身不是原子的，需要加 lock 才是原子的，而 lock 是通过锁内存总线来实现原子性的。

内存总线就一条，是独占的，不管你是多核还是单核，同一时间，只能有一个能占用总线。当然，这个占用总线的，可以是 CPU 的核，也可以是 DMA 等能访问内存的设备，一般叫 bus master。一个元器件读内存时就会占用总线，读完后再解除对总线的占用，其它元器件才能进总线继续访问内存，任何元器件不会在一次读内存的中间时刻解除对总线的占用，因此，对内存的一个读操作是原子的。写内存同理。但 cmpxchg 这类指令对于内存的访问不止一次，它是一次读加一次写，所谓 read-modify-write 操作。这样的话，由于读和写是两个单独的操作，会分别占用总线，而不是持续占用总线，所以不是原子的，读和写之间可能会有其它元器件对内存的访问。因此，为了实现 cmpxchg 的原子操作，需要在指令前加上 lock 前缀。

cmpxchg 指令读取目的内存操作数，与寄存器中值比对，如果相同，则将新值写到目的内存地址。加上 lock 后，读内存时，会对内存总线发出 LOCK 信号，锁住总线，这个锁，要到将新值写到目的内存地址后才会解除，因此，加上 lock 前缀的 cmpxchg 指令在读与写之间是不会有其它元器件对内存进行访问的，所以是原子的。

当 CPU 为单核时，尽管 cmpxchg 要访问两次内存，但在该指令执行过程中，不会有其它的核来打断指令执行过程（中断不会发生在单条指令执行过程中，只会发生在指令执行前后），因此，在读与写之间也就不会有其它核去访问内存，所以单核 CPU 不用加 lock 前缀就已经是原子的了。（但是由于 DMA 的存在，我怀疑，理论上也存在 DMA 插入到 cmpxchg 访问内存过程中的情况，只是一般我们编程不会让 DMA 与 CPU 同时访问同一块内存区域而避开了这个问题，这只是我的猜测，还没去证实）

以上是我对 CPU 直接访问内存时的 cmpxchg 指令的理解。

然后说说当内存已经在 CPU Cache 里时，cmpxchg 的 lock 细节。

在 Intel 手册中有这么一段（卷3 8.1.4）：

> For the Intel486 and Pentium processors, the LOCK# signal is always asserted on the bus during a LOCK operation, even if the area of memory being locked is cached in the processor.

> For the P6 and more recent processor families, if the area of memory being locked during a LOCK operation is cached in the processor that is performing the LOCK operation as write-back memory and is completely contained in a cache line, the processor may not assert the LOCK# signal on the bus. Instead, it will modify the memory location internally and allow it's cache coherency mechanism to ensure that the operation is carried out atomically. This operation is called "cache locking. " The cache coherency mechanism automatically prevents two or more processors that have cached the same area of memory from simultaneously modifying data in that area.

就是说 Intel 486 和 Pentium 处理器，LOCK# 信号总是会发到总线去，即使要锁的内存区域已经在 CPU Cache 中了。[《Pentium Processor System Architecture》](https://books.google.com/books?id=TVzjEZg1--YC&pg=PA119&dq=lock%23+and+cache+coherency&hl=en&newbks=1&newbks_redir=0&sa=X&ved=2ahUKEwjChMPz0sTmAhX3yosBHZI0C2cQ6AEwAHoECAQQAg#v=onepage&q=lock%23%20and%20cache%20coherency&f=false)证明的确如此。

而 P6 和更新的处理器则不同，如果要锁的内存已经在 cache 中，而且在一个 cache 行内（一般 64 个字节为一行），内存模式又是 write-back 的话，那么处理器 **可能** 不会发 LOCK# 信号到总线上。它会直接改 cache，然后交给 cache 一致性机制去保证操作的原子性。cache 一致性机制能保证多核不会同时修改同一块被缓存的内存区域。

一开始，我并没有往深了去想，后来看了那篇知乎帖子，作者认为 P6 和更新的处理器直接就再也不往总线发 LOCK# 信号了，一切都交给 cache 一致性去解决，我对此有了疑惑，于是开始进一步探究。

首先什么是 write-back 的内存模式？

根据 Intel 手册第3卷 11。3 所述：

> **Write-back(WB)** —— Writes and reads to and from system memory are cached. Reads come from cache lines on cache hits; read misses cause cache fills. Speculative reads are allowed. Write misses cause cache line fills (in processor families starting with the P6 family processors), and writes are performed entirely in the cache, when possible. Write combining is allowed. The write-back memory type reduces bus traffic by eliminating many unnecessary writes to system memory. Writes to a cache line are not immediately forwarded to system memory; instead, they are accumulated in the cache. The modified cache lines are written to system memory later, when a write-back operation is performed. Write-back operations are triggered when cache lines need to be deallocated, such as when new cache lines are being allocated in a cache that is already full. They also are triggered by the mechanisms used to maintain cache consistency. This type of cache-control provides the best performance, but it requires that all devices that access system memory on the system bus be able to snoop memory accesses to insure system memory and cache coherency. 

可以看到，Write-back 模式下，CPU 只和 cache 打交道，不管读还是写，都不直接访问内存。但是上面写到 「writes are performed entirely in the cache，when possible.」，也就是说写还是有例外情况的，虽然不知道它这里的 impossible 具体是什么情况，暂且搁下不管。

那么这样的话，CPU 完全从 cache 读写，LOCK# 信号就一定不会出现在内存总线了，但文档中为什么用的词是 **可能** 呢？难道，正是 'when possible' 的例外情况？

知乎帖子的作者认为，在这种情况下，两个核同时执行 cmpxchg 时，两者都会判断成功，然后都去写那块内存，然后 cache 一致性机制会有 cache 总线仲裁机制，判定只有一个写成功，另一个需要失效自己的缓存，并从写成功的那个核的缓存中读取新值。

> 说了这些背景知识之后，再回到我们的 CAS 指令。

> 当两个 core 同时执行针对同一地址的 CAS 指令时，其实他们是在试图修改每个 core 自己持有的 cache line，假设两个 core 都持有相同地址对应 cache line，且各自 cache line 状态为 S，这时如果要想成功修改，就首先需要把 S 转为 E 或者 M，则需要向其它 core invalidate 这个地址的 cache line，则两个 core 都会向 ring bus 发出 invalidate 这个操作，那么在 ring bus 上就会根据特定的设计协议仲裁是 core0，还是 core1 能赢得这个 invalidate，胜者完成操作，失败者需要接受结果，invalidate 自己对应的 cache line，再读取胜者修改后的值，回到起点。

> 到这里，我们可以发现 MESIF 协议大大降低了读操作的时延，没有让写操作更慢，同时保持了一致性！那么对于我们的CAS操作来说，其实锁并没有消失，只是转嫁到了 ring bus 的总线仲裁协议中。而且大量的多核同时针对一个地址的 CAS 操作会引起反复的互相 invalidate 同一 cache line，造成 ping pong 效应，同样会降低性能。 只能说基于CAS的操作仍然是不能滥用，不到万不得已不用，通常情况下还是使用数据地址范围分离模式更好。

如果是这样的话，按作者的想法，cmpxchg 直接就是原子的，不需要加 lock，现在假设要加锁的内存同时被两个核 cache 住。两个核同时执行 cmpxchg 指令，都判断成功，准备设置新值，其中一个成功，另一个失败。失败的那个，除了失效自己的 cache 外，还要去写成功的那个核的 cache 中把新值读回来，然后再放到 eax(rax) 寄存器中，因为 cmpxchg 的功能就是这样，成功则设置新值，失败则将内存的值 load 到 eax(rax) 寄存器中。那么，这样一看，cmpxchg 指令的电路设计就有点复杂了，还跟 cache 的电路逻辑耦合了，我怀疑设计人员不会这样干。而且那篇帖子的评论中有人测试过不加 lock 会得到不正确的结果（我自己没试），所以我倾向于认为作者说的不对。

再来说说我的猜想，我认为 cmpxchg 在 write-back 模式下，即使 cache 命中，也必须加 lock 才是原子的：

分情况讨论：
一、要加锁的内存被一个核 cache 住
这种情况，cache line 的状态为 Exclusive，表示暂时只有我一个核 cache 了，那么当该核（后面称为核A）执行带 lock 的 cmpxchg 时，会去锁 cache，然后先执行一个读，判断相等，再准备写 cache。若此时（写 cache 之前）有另一个核（后面称为核B）请求读该内存，核A会 snoop 到这个请求，发出 HITM# 信号，表示这个内存现在在我的 cache 里。核B收到 HITM# 信号，会发出 BOFF# 信号取消对内存的总线请求，并等待核A把数据发过来。由于核A现在对 cache 加了锁，还在执行 cmpxchg，所以它会等指令执行完了之后再发数据。核A执行完 cmpxchg，取消对 cache 的锁，然后将数据发往核B，核B的 BOFF# 信号取消。根据 Intel 文档描述（卷3 11.2），此时，内存控制器也应该监听到这个数据，然后由内存控制器自己更新内存，以保持内存与核A的 cache 一致。

二、要加锁的内存同时被两个核 cache 住
这种情况，cache line 的状态为 Shared，表示不止我一个核 cache 了。那么这种情况对 cache 加锁是没用的，因为每个核访问自己核中生效的 cache 时，它是不会去跟外面的核交互的，要不然性能就太低了，而对 cache 加锁也只能对自己的 cache 加，然而别的核的 cache 中自己就有数据，根本不看你的 cache，那加了锁又有什么用呢。这时，两个核 cmp 都会成功，然后准备执行 xchg，这下就又回到了那个知乎帖子作者说的情况了。
因此，我猜，在 cache line 状态为 Shared 时，lock 会将 cache 失效（自己的和别人的），然后将访问打到内存总线去，通过内存总线仲裁，两个核只有一个核能锁住总线，锁成功的那个执行读-比较-写，等锁失败的那个取得总线访问权后，读-比较就失败了，因为内存已经被写了新值。对于带 lock 的读，即使是 write-back 模式，应该也是不会去填充 cache 的。（[《Pentium Processor System Architecture》](https://books.google.com/books?id=TVzjEZg1--YC&pg=PA119&dq=lock%23+and+cache+coherency&hl=en&newbks=1&newbks_redir=0&sa=X&ved=2ahUKEwjChMPz0sTmAhX3yosBHZI0C2cQ6AEwAHoECAQQAg#v=onepage&q=lock%23%20and%20cache%20coherency&f=false)介绍以前 Pentium 处理器就是这么干的）

这也许就是 Intel 8.1.4 说 **可能** 的原因，在 Exclusive 状态下直接做 cache locking，不会在内存总线上发 LOCK# 信号，在 Shared 状态下会回退到 Pentium 处理器的策略。对比 Pentium 的总是往内存总线发 LOCK# 信号算是有优化吧。

当然这些都是我猜的，因为我只找到一本 Pentium 架构的书，没知道更新的处理器的架构的，如果你知道这方面的资料，还请告诉我。