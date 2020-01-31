---
layout: post
title: "Hotspot 源码阅读 — 解释器模式下的 safepoint 实现"
excerpt: "解释器模式下，Hotspot 是怎么实现 safepoint 的？"
---

在 GC 时，JVM 需要暂停所有的应用线程才能执行垃圾回收，通常这个暂停被叫做 Stop The World (STW)，这篇文章就来讲讲 JVM 是怎么实现 STW 的。

在一些讲解 JVM 原理的书中我们已经知道了，STW 是通过 safepoint 来实现的，应用线程通过不断轮询 safepoint 来判断是否需要暂停自己，接下来我们就来看看应用线程到底是怎么来检查 safepoint 的。

事实上，在应用线程检查 safepoint 之前，应该会有 VM 线程来通知应用线程是否要做检查，否则，不需要 STW 时应用线程也去检查 safepoint 就没必要了，会造成无畏的性能浪费。所以，我们不妨从这个通知的入口处着手。

这个入口就是 safepoint.cpp 的 void SafepointSynchronize::begin() 方法，当需要 STW 时，VM 线程会调用该方法。

该方法的关键代码如下：

```
void SafepointSynchronize::begin() {
  // 锁住 Threads_lock，这把锁是关键，所有的应用线程都会被 block 在这把锁上
  Threads_lock->lock();
  
  // 锁住 Safepoint_lock，在 mu 析构的时候自动解锁
  MutexLocker mu(Safepoint_lock);

  // 应用线程总数
  int nof_threads = Threads::number_of_threads();
  _waiting_to_block = nof_threads;

  // 将解释器更换为检查 safepoint 的版本，普通的解释器是不检查 safepoint 的
  // 从现在开始，所有应用线程解释执行字节码时都会检查 safepoint
  Interpreter::notice_safepoints();

  {
    while (_waiting_to_block > 0) {
      if (!SafepointTimeout || timeout_error_printed) {
        // 在该锁上 wait，这个操作会暂时释放锁的占有权
        Safepoint_lock->wait(true);
      } else {
        // 这个是 safepoint 带超时的逻辑，我们只看上面不带超时的逻辑就行
        ...
      }
    }

    // 此时所有应用线程都是 block 状态，STW 达成！
    _state = _synchronized;
  }

```

然后看看应用线程是怎么与 VM 线程协调达成 STW 的，应用线程会在 safepoint 检查逻辑中调用 SafepointSynchronize::block(JavaThread *thread) 方法，该方法也在 safepoint.cpp 中，它的关键代码如下：

```
void SafepointSynchronize::block(JavaThread *thread) {

  // 保证下面操作的原子性
  Safepoint_lock->lock_without_safepoint_check();

  if (is_synchronizing()) {
    _waiting_to_block--;
    // 最后一个应用线程负责通知 VM 线程
    if (_waiting_to_block == 0) {
      // 唤醒 VM 线程抢锁，unlock 后 VM 线程就能抢到了
      Safepoint_lock->notify_all();
    }
  }

  thread->set_thread_state(_thread_blocked);

  // 释放锁，VM 线程会从相应的 wait 处返回并继续往下执行
  Safepoint_lock->unlock();

  // 最终应用线程都被阻塞在这，因为这把锁一开始就在 SafepointSynchronize::begin() 里被 VM 线程抢占了
  // 此时 STW 达成，这把锁一直到 VM 线程执行 SafepointSynchronize::end() 方法时才会被释放
  Threads_lock->lock_without_safepoint_check();

  thread->set_thread_state(state);

  Threads_lock->unlock();
}
```

以上就是达成 STW 过程中，应用线程与 VM 线程之间的协调逻辑。值得注意的是，应用线程释放 Safepoint_lock 后，就算 STW 达成了，因为 VM 线程也没办法保证应用线程都执行到了 Threads_lock 处，但是不要紧，反正应用线程释放锁后最多也只能执行到 Threads_lock 处，不会再动内存了，所以，此时完全可以看作 STW 达成了。

上面介绍了 VM 线程进入 STW 的入口，但是没介绍应用线程是怎么进入 STW 逻辑的，接着往下看。

VM 执行 SafepointSynchronize::begin() 时有一行代码：Interpreter:notice_safepoints()

```
void TemplateInterpreter::notice_safepoints() {
  if (!_notice_safepoints) {
    // switch to safepoint dispatch table
    _notice_safepoints = true;
    copy_table((address*)&_safept_table, (address*)&_active_table, sizeof(_active_table) / sizeof(address));
  }
}
```

可以看到，这一步操作把解释字节码用的表换成了 _safept_table（正常解释时用的是 _normal_table）

那么 _safept_table 有什么特别的地方呢？

```
TemplateInterpreterGenerator::generate_all() {
  Interpreter::_safept_entry =
      EntryPoint(
                 generate_safept_entry_for(btos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(ztos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(ctos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(stos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(atos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(itos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(ltos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(ftos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(dtos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint)),
                 generate_safept_entry_for(vtos, CAST_FROM_FN_PTR(address, InterpreterRuntime::at_safepoint))
                 );
}

address TemplateInterpreterGenerator::generate_safept_entry_for(
        TosState state,
        address runtime_entry) {
  address entry = __ pc();
  __ push(state);
  __ call_VM(noreg, runtime_entry);
  __ dispatch_via(vtos, Interpreter::_normal_table.table_for(vtos));
  return entry;
}
```

可以看到，其实最终还是用 _normal_table 来解释的，只是前面还调用了 InterpreterRuntime::at_safepoint 方法，这个方法，正是用来轮询 safepoint 的。

InterpreterRuntime::at_safepoint 这个方法是用宏定义的，这里把它的核心代码还原一下：

```
void InterpreterRuntime::at_safepoint(JavaThread* thread) {
  ThreadInVMfromJava __tiv(thread);
}

class ThreadInVMfromJava : public ThreadStateTransition {
 public:
  ~ThreadInVMfromJava()  {
    trans(_thread_in_vm, _thread_in_Java);
  }
};

void trans(JavaThreadState from, JavaThreadState to)  { transition(_thread, from, to); }

static inline void transition(JavaThread *thread, JavaThreadState from, JavaThreadState to) {
  if (SafepointSynchronize::do_call_back()) {
    SafepointSynchronize::block(thread);
  }
}
```

当 ThreadInVMfromJava 离开作用域时，它的析构函数被调用，最终会调用到我们最开始分析的 SafepointSynchronize::block(thread) 方法，从上面分析可以看到 safepoint 是在每次字节码解释之前检查的。

最后，用一张图来总结下 STW 达成过程中的逻辑。

<img src="/img/posts/safepoint-on-interpreter-mode-r1.png" os="mac"/>