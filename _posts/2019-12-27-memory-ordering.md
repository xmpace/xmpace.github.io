
## “乱序”其实并非乱序

指定执行是有步骤的，比如一条指令一般执行步骤如下：
1. 读取指令
2. 准备操作数
3. 在对应的工作单元执行指令（比如在加法器中做加法）
4. 将结果写到寄存器

如果让指令一条一条执行，会有什么问题呢？

效率太低！比如我前一条指令已经在第 3 步了，那么前两步的资源其实就已经让出来了，但这时候由于指令还没有执行完成，所以后面的指令无法进入，这就造成了资源的浪费。

因此，为了提高效率，我们把指令的执行过程划分成一段段的流水线（也就是上面对应的步骤），当前一条指令进入下一步流水线时，后面的指令就可以跟着进入流水线提前开始执行了。

这样能提高效率，但还不够！指令仍然是按顺序执行的，但其实没必要！

比如，我有两条指令

```
mov r1, mem1
mov r2, mem2
```

这两条指令其实谁先完成谁后完成，在单核 CPU 上，完全无所谓。反正最后的逻辑都是正确的。那如果 mem2 已经在 cache 中了，而 mem1 不在 cache 中，我也得先完成第一条指令，再完成第二条指令吗？

显然有更高效的做法。当第一条指令在等 mem1 时，第二条指令也可以同时执行，不必关心第一条指令是不是已经完成了。假设 CPU 有从 cache 及内存取数的工作单元，我只要把这种单元多做一个就行了。

现代 CPU 正是这样设计的。CPU 的指令执行单元（如加法器）往往会设计多个，以提高性能。

所以现代 CPU 的指令执行过程往往是这样的：

1. CPU 按顺序读取指令
2. 将指令分发到指令队列中（这个队列一般由 [Reorder Buffer](https://en.wikipedia.org/wiki/Re-order_buffer) 和 [reservation stations](https://en.wikipedia.org/wiki/Reservation_station) 组成）
3. 队列中的指令，只要某条指令的操作数被准备好（有可能是前面指令的执行结果），并且当前有可用的执行单元（如加法器），则不管指令进入队列的先后顺序，都可以立即被发送到执行单元执行
4. 执行结果入队列
5. 如果执行结果有依赖关系，也需要按依赖关系写回结果。（比如前后两条指令执行后结果都写回 EAX 寄存器，那么尽管后面一条指令先出结果，也要等前面那条指令写完结果再写自己的结果）

> CPU 的整体执行方式从程序流驱动变成了数据流驱动<sub>[1]</sub>。（这句话直接引用自老狼的[《什么是Speculative Execution？为什么要有它？》](https://zhuanlan.zhihu.com/p/33145828)，放这里是因为觉得这句描述实在太贴切了）

由此可见，所谓乱序(Out-of-order)其实有点“名不副实”。“乱序”这个词说得好像是专门为了打乱顺序而去做的设计，其实乱序根本就不是初衷，它只是一个“副作用”而已。

真正的初衷，是让具备执行条件的指令，可以借助冗余设计的执行单元而优先执行，以提升指令执行的吞吐量。

所以“乱序”一词并不贴切，更贴切的描述可能是指令的“并行执行”(parallel execution)，“乱序”只是指令“并行执行”的一种表象而已。

*PS: 本文后面内容仍然会用“乱序”一词，以保持跟大家一致。*

## 指令的乱序执行会影响内存排序(memory ordering)吗？

指令的乱序执行我们已经知道了，我们接着再了解几个术语。

首先，什么是内存排序？

内存排序指的是处理器通过系统总线读写内存的顺序。这个内存不光是我们平常所指的内存，还可能包括 cache。这跟内存模式(memory type)有关，比如，在 write-back 模式下，CPU 读是将内存数据先读到 cache，再从 cache 读的，写也是一样，直接写到 cache，剩下的 cache 与内存的一致性交给 cache 一致性组件去做了。所以，在这种情况下，也算 CPU 通过系统总线读写内存。

为什么会有内存排序出现？原因就是上面说的乱序执行，还是以上面的例子来说明：

```
1. mov r1, mem1
2. mov r2, mem2
```

只要程序得到的结果是正确的，这两条指令谁先谁后并不重要，对结果无影响。为了后续方便说明，暂且将这个例子叫做 LoadLoad 例子（因为是两个 Load 操作）。

如果指令 1 先执行，则程序是先读 mem1，再读 mem2，这就是一种内存顺序。顺便说一句，这种顺序也叫 **程序顺序(program ordering)**。

如果指令 2 先执行，则程序是先读 mem2，再读 mem1，那么这又是另一种内存顺序。

显然，指令的乱序执行对于内存排序是有影响的，**然而，现代 CPU 并不会任由乱序执行影响内存排序**，CPU 往往会在性能及编程易用性上（也有向前兼容考量）做一个折中，定义自己的内存排序模型，这种排序模型姑且叫它 **处理器排序模型** (processor ordering)。

（图）

来源：https://en.wikipedia.org/wiki/Memory_ordering

如图是常见处理器的内存排序模型，以我们最熟悉的 x86 为例，发现只有 Stores can be reordered after loads 这一种乱序。

可见我们上面举的例子是不会在 x86 处理器上发生的。处理器的具体的排序原则可以参考 *Intel developer manual Volume 3 8.2.2*。

## x86 的内存排序
x86 的 StoreLoad 重排的原因我们等下再说，先说下我们先前举的 LoadLoad 例子不重排的原因。

在 x86 处理器的乱序架构中，有一个 Re-order buffer (ROB) 的结构，所有的指令会按照先后顺序在里面排列，等它们依赖的操作数准备好了就会进入 Reservation Station 等待调度执行，它们在 Reservation Station 里谁先执行谁后执行是不确定的，原因是我们前面说过的乱序执行，但它们在 ROB 中的排列是严格按照程序顺序的。

指令执行出了结果以后并不直接将结果写到目的地（内存或寄存器），而是又写回到 ROB 中存到对应的指令项中，这一步在指令执行中叫 write-back，指令执行还有最后一步：write-commit，也就是将结果写到真正的目的地（内存或寄存器）。x86 限制了只有当前面一条指令 write-commit 后，本条指令才会 write-commit，由于指令在 ROB 中是按程序顺序排列的，因此，内存排序也就是程序顺序了。

问题来了，照这么说，LoadLoad、LoadStore、StoreStore 不会重排完全可以理解，但 StoreLoad 怎么又重排了？有了 ROB，理论上 StoreLoad 也不应该重排才对。

这就得介绍一下 store buffer 了。

内存模式为 write-back 时，CPU 读写都是直接访问的 cache，写的时候，由于 cache 是按行缓存的（一般一行 64 个字节），所以如果一个字节一个字节地写的话，就很不划算了，最好是能攒一批一次写到 cache 去，另外，如果是共享变量的话，写还要保证缓存一致性，写完本核的 cache 后，需要将其它核中对应的 cache 给 invalidate 掉，不止要给其它核发 invalidate message，还要等 invalidate ack，这就拖了太多后腿了。所以，现代 CPU 设计了一个 store buffer 用来缓冲，指令先将数据写到这里面，再异步去写到 cache 中去，以此来提升性能。

store buffer 是每个核私有的，因此，就存在一个写可见性的问题，写在 store buffer 里的东西，是暂时无法被其它核看见的，只有从 store buffer 写到 cache 后，其它核才能看见。

这下你应该明白为啥 StoreLoad 会重排了，举个例子：

```
mov [mem1], 1
mov r1, [mem2]
```

核 A 执行指令 ```mov [mem1], 1``` 将 1 写到了 store buffer，然后执行 ```mov r1, [mem2]``` 从 mem2 读数据到 r1，那么在其它核看来，核 A 访问内存的顺序是先读 mem2，后才写的 mem1。

但要注意，如果是

```
mov [mem1], 1
mov r1, [mem1]
```

这种情况又不同了，这种情况内存不会重排序，因为读操作会去扫描 store buffer，如果 store buffer 命中就直接从 store buffer 取了。

## x86 的内存屏障
有内存排序就有对应的阻止内存排序的方法，前面说了在 x86 中只有 StoreLoad 会重排，如何禁止这种重排呢？

x86 提供了 mfence 指令：

```
mov [mem1], 1
mfence
mov r1, [mem2]
```

mfence 可以禁止所有的重排，包括 LoadLoad、LoadStore、StoreStore。 

除了 mfence，在这个场景下，带 lock 的 addl 指令也可以实现同样的效果，而且有人发现，lock addl 比 mfence 效率更高<sub>[2]</sub>，于是在 hotspot 源码中你会发现这段代码：

```
inline void OrderAccess::storeload()  { fence();            }
inline void OrderAccess::fence() {
  if (os::is_MP()) {
    // always use locked addl since mfence is sometimes expensive
#ifdef AMD64
    __asm__ volatile ("lock; addl $0,0(%%rsp)" : : : "cc", "memory");
#else
    __asm__ volatile ("lock; addl $0,0(%%esp)" : : : "cc", "memory");
#endif
  }
  compiler_barrier();
}
```

## lfence 与 sfence
x86 的内存屏障除了 mfence 外，还提供了 sfence 与 lfence。

sfence 用来 flush store buffer，保证 store buffer 中的数据被写入到 cache。

lfence 则与 cache 的 invalidate 有关。

为了维持 cache 一致性，一个核在写 cache 时，必须 invalidate 其它核的对应 cache，这个过程包含发送 invalidate message，等待 invalidate ack，相对 CPU 来说是个开销比较大的操作，因此，为了更好的性能，CPU 实现了一个 invalidate queue，invalidate message 会被写到其它核的 invalidate queue 中，写完后就 ack 了，然后再异步去处理 invalidate message。

lfence 就是用来 flush 这个 invalidate queue 的。

## acquire 与 release
在 Hotspot 中，除了上面提到的这些内存屏障，还定义了两个内存屏障：acquire 与 release。

在 Hotspot 源码的 orderAccess.hpp 文件的注释中，有一段对于 acquire 及 release 的说明，我这里借用一下里面的例子。

```
T1: access_shared_data
T1: ]release
T1: (...)
T1: store(X)

T2: load(X)
T2: (...)
T2: acquire[
T2: access_shared_data
```

在这个例子中，如果 T2: load(X) 发生于 T1: store(X) 之后，那么 T2: access_shared_data 就一定发生于 T1: access_shared_data 之后。

相信你已经看出来了，T1: store(X) 与 T2: load(X) 这就是个 StoreLoad，在 x86 里面是可能重排的，那怎么保证 T2: load(X) 发生在 T1: store(X) 之后呢？再举个例子：

| T1 | T2 |
| :-----| ----: |
| set data=1<br>release<br>set flag=1<br> | while (flag != 1){}<br>acquire<br>get data<br> |

在这个例子中，可以保证 T1 的 set data 与 set flag 不会重排，T2 的 get flag 与 get data 也不会重排。

从语义上可以看出，release 阻止 LoadStore 和 StoreStore 的重排，acquire 阻止 LoadLoad 和 LoadStore 的重排。

在 x86 平台上，这几种情况本来也不会重排，因此，x86 平台上 release 和 acquire 的实现都是空指令。

也就是说在 x86 平台上不需要任何内存屏障就能保证 **在上面这种例子中**，对共享变量的读写逻辑正确，可以避免无畏的性能损耗。

## 参考资料
1. https://zhuanlan.zhihu.com/p/33145828
2. https://shipilev.net/blog/2014/on-the-fence-with-dependencies/
3. https://en.wikipedia.org/wiki/Out-of-order_execution
4. https://preshing.com/20120710/memory-barriers-are-like-source-control-operations/
5. https://hadibrais.wordpress.com/2019/02/26/the-significance-of-the-x86-sfence-instruction/
6. https://courses.cs.washington.edu/courses/csep548/06au/lectures/coherency.pdf
7. http://www2.in.tum.de/hp/file?fid=1276
8. https://en.wikipedia.org/wiki/MESI_protocol