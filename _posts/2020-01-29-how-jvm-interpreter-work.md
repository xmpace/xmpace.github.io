---
layout: post
title: "Hotspot 源码阅读 — 字节码是如何被解释执行的"
excerpt: "Hotspot JVM 中字节码是如何被解释执行的"
---

这篇文章主要关注字节码解释执行的部分，因此，直接从方法区的调用入口开始说起。

方法调用的入口在 javaCalls.cpp 中，入口代码如下：

```cpp
void JavaCalls::call_helper(JavaValue* result, const methodHandle& method, JavaCallArguments* args, TRAPS) {
  // do call
  { JavaCallWrapper link(method, receiver, result, CHECK);
    { HandleMark hm(thread);  // HandleMark used by HandleMarkCleaner

      // 调用方法
      StubRoutines::call_stub()(
        (address)&link,
        // (intptr_t*)&(result->_value), // see NOTE above (compiler problem)
        result_val_address,          // see NOTE above (compiler problem)
        result_type,
        method(),
        entry_point,
        args->parameters(),
        args->size_of_parameters(),
        CHECK
      );

      result = link.result();  // circumvent MS C++ 5.0 compiler bug (result is clobbered across call)
      // Preserve oop return value across possible gc points
      if (oop_result_flag) {
        thread->set_vm_result((oop) result->get_jobject());
      }
    }
  } // Exit JavaCallWrapper (can block - potential return oop must be preserved)
}

static CallStub call_stub() { return CAST_TO_FN_PTR(CallStub, _call_stub_entry); }
```

entry_point 就是 Java 方法的入口点，我们等会再去看 entry_point 进去是啥样的，先看看 entry_point 是怎么被调用的。

上面的代码显示，entry_point 是被位于 _call_stub_entry 地址处的函数调用的，那 _call_stub_entry 处的函数长啥样呢？

```cpp
  StubRoutines::_call_stub_entry =
    generate_call_stub(StubRoutines::_call_stub_return_address);

  address generate_call_stub(address& return_address) {
    address start = __ pc();

    const Address rsp_after_call(rbp, rsp_after_call_off * wordSize);
    const Address call_wrapper  (rbp, call_wrapper_off   * wordSize);
    const Address result        (rbp, result_off         * wordSize);
    const Address result_type   (rbp, result_type_off    * wordSize);
    const Address method        (rbp, method_off         * wordSize);
    const Address entry_point   (rbp, entry_point_off    * wordSize);
    const Address parameters    (rbp, parameters_off     * wordSize);
    const Address parameter_size(rbp, parameter_size_off * wordSize);

    // stub code
    __ enter();
    __ subptr(rsp, -rsp_after_call_off * wordSize);

    ...
```

原来这个函数是用汇编生成的，对汇编不熟悉的同学看到这可能就晕了，不要怕，等会我从更高的语言层面还原一下这个函数在干什么。但有个问题我们先思考一下，为什么不用 C++ 直接写函数，而要用汇编去生成函数？

首先肯定不是因为 C++ 实现不了，这段函数也没什么特别的，用 C++ 完全可以实现，即使有少部分地方非得用汇编不可，也大可以用 C++ 嵌入汇编来实现，可读性会好得多，完全没必要绕一大圈，用汇编生成代码。

我猜测是为了性能，类似于编译时计算与运行时计算。

比如，函数中有这样的代码：

```cpp
    if (UseAVX > 2) {
      __ movl(rbx, 0xffff);
      __ kmovwl(k1, rbx);
    }
```

如果用 C++ 来写运行时代码，那每次 Java 方法的调用，都要执行 if (UseAVX > 2)，然而，这个 UseAVX 并不是一个变量，它其实是一个常量，在 JVM 初始化时就可以确定下来，一旦确定下来，就不会变了。因此用汇编生成的方案可以完全去除这行多余的分支判断代码，否则，这些分支判断代码还要带到运行时里面，造成额外的性能开销。

虽然看起来，分支判断也就多一两条指令而已，但分支判断还涉及一个分支预测的问题，会影响到性能（尽管现代 CPU 分支预测有很高的命中率），再加上累计调用，这个性能开销我认为还是值得去优化的。

接着说 _call_stub_entry 函数，还原一下，函数核心功能如下：

```cpp
void _call_stub_entry(address link,
                      intptr_t* result,
                      BasicType result_type,
                      Method* method,
                      address entry_point,
                      intptr_t* parameters,
                      int parameter_size,
                      Thread* thread) {
  ...
  *result = entry_point(parameters, method);
  ...
}
```

呃，前面扯了一堆，结果发现它只是个壳而已（从名字也该看出来了）...

我们接着挖 entry_point 吧。

```cpp
  static address    _entry_table[number_of_method_entries];     // entry points for a given method

  enum MethodKind {
    zerolocals,                                                 // method needs locals initialization
    zerolocals_synchronized,                                    // method needs locals initialization & is synchronized
    native,                                                     // native method
    native_synchronized,                                        // native method & is synchronized
    empty,                                                      // empty method (code: _return)
    accessor,                                                   // accessor method (code: _aload_0, _getfield, _(a|i)return)
    abstract,                                                   // abstract method (throws an AbstractMethodException)
    ...
  };

#define method_entry(kind)                                              \
  { CodeletMark cm(_masm, "method entry point (kind = " #kind ")"); \
    Interpreter::_entry_table[Interpreter::kind] = generate_method_entry(Interpreter::kind); \
    Interpreter::update_cds_entry_table(Interpreter::kind); \
  }

  // all non-native method kinds
  method_entry(zerolocals)
  method_entry(zerolocals_synchronized)
  method_entry(empty)
  method_entry(accessor)
  method_entry(abstract)
```
经过跟踪，发现 entry_point 是 _entry_table[] 这个数组中的一个 item。JVM 将 Java 方法分为很多种类型，比如需要初始化局部变量的方法类型 zerolocals，带 synchronized 的 zerolocals 方法等。_entry_table 是一个方法入口数组，其中的每一项都表示一种方法的入口，比如 _entry_table\[zerolocals] 表示 zerolocals 类型的方法的入口。

_entry_table 数组又是怎么生成的呢？找个典型 _entry_table[zerolocals] 跟踪一下，最终发现是 generate_normal_entry 这个函数生成的。

```cpp
address TemplateInterpreterGenerator::generate_normal_entry(bool synchronized) {
  address entry_point = __ pc();

  const Address constMethod(rbx, Method::const_offset());
  const Address access_flags(rbx, Method::access_flags_offset());
  const Address size_of_parameters(rdx, ConstMethod::size_of_parameters_offset());
  const Address size_of_locals(rdx, ConstMethod::size_of_locals_offset());

  __ movptr(rdx, constMethod);
  __ load_unsigned_short(rcx, size_of_parameters);

  ...

  // 这里正式开始解释字节码
  __ dispatch_next(vtos);

  return entry_point;
}
```

这个函数又是汇编生成的，不过这里不打算还原汇编代码了，因为这里确实用汇编更合适，它的核心功能是构造调用栈，Java 方法的参数、局部变量等都在这个栈上。

略去其它不重要的分支逻辑，栈从前面的 _call_stub_entry 到 generate_normal_entry 变化如下：

<img src="/img/posts/how-jvm-interpreter-work-r1.png" os="mac"/>

图中虽然画了一堆，但实际上我们着重关注几个就可以了，分别是 parameters, locals 以及 rbcp 寄存器。因为目前我们主要是为了研究字节码解释，而字节码解释中最重要的就是这三个。parameters 是传给 Java 方法的参数，locals 是 Java 方法用到的局部变量，rbcp 指向的则是 Java 方法的字节码。注意，parameters 也被当做 locals 局部变量统一对待，所以 rlocals 寄存器指向第一个参数。

栈构造好后就调用 ```__ dispatch_next(vtos)``` 正式开始解释字节码了，接着来研究下 ```dispatch_next(vtos)``` 是怎么解释字节码的。

```cpp
// state 参数暂时先不管它是干什么的，不影响理解，后面再讲。step 默认值为 0
void InterpreterMacroAssembler::dispatch_next(TosState state, int step) {
  // _bcp_register 就是 rbcp，这一步将 rbcp 指向的字节码读取一个字节到 rbx
  load_unsigned_byte(rbx, Address(_bcp_register, step));
  // 由于 step 此时为 0，所以这里暂时还没有递增 rbcp 指针
  increment(_bcp_register, step);
  // 关键在这里
  dispatch_base(state, Interpreter::dispatch_table(state));
}

static address* dispatch_table(TosState state) { return _active_table.table_for(state); }

address _table[number_of_states][length];

address* table_for(TosState state) { return _table[state]; }

void InterpreterMacroAssembler::dispatch_base(TosState state,
                                              address* table,
                                              bool verifyoop) {
  ...
  // 表地址加载到 rscratch1 寄存器
  lea(rscratch1, ExternalAddress((address)table));
  // jmp [rscratch1 + rbx*8]
  jmp(Address(rscratch1, rbx, Address::times_8));
}
```

由此看出，关键在 dispatch_table，rbcp 指向的字节码实际上是一个 8 位的索引，最多可索引 256 项，也就是说 JVM 字节码指令最多只有 256 条。dispatch_table 是字节码指令的分派表，里面的每一项很明显就是字节码指令的解释子程序。

一切看起来都似乎很合理，但是等等，为什么字节码分派需要一张二维的表，而不是一个一维数组？从上面代码可以看出，```dispatch_table(state)``` 返回的是一个一维数组，dispatch_table 本身是一张二维的表。

其实，如果只是从实现功能的角度来说，一维数组就够了，用字节码做索引，数组中的每一项是一个字节码解释子程序。但 Hotspot 的实现还考虑了性能优化，性能优化与代码的可读性可以说是一对矛盾体，这里，dispatch_table 设计成二维的表也是为了性能优化。

因此，我们循序渐进，先从简单的一维数组的实现方式说起，然后再研究 Hotspot 做了性能优化后的实现方式。

对 JVM 稍有了解的同学应该知道，Hotspot JVM 是基于栈的虚拟机，另一种是基于寄存器的虚拟机，这两者各有优缺点，这里不做讨论。基于栈的虚拟机有一个表达式栈，计算是借助于这个表达式栈来完成的。比如，Java 代码 ```int c = a + b;``` 会被编译为字节码：

```java
iload_1
iload_2
iadd
istore_3
```

这些字节码指令在表达式栈上的计算过程如下图所示，还记得前面图中画的 **表达式栈底** 的位置吧？

<img src="/img/posts/how-jvm-interpreter-work-r2.png" os="mac"/>

那么这些操作需要读写内存几次呢？我们来分析一下，iload_1 从 局部变量槽 1 取数据压到表达式栈，内存读一次，写一次。iadd 将栈顶两数据取出来相加，再将结果压到表达式栈，读两次，写一次。istore_3 将表达式栈结果取出存到局部变量槽，读一次，写一次。

如果我们缓存一个栈顶数据到寄存器，那么就可以减少对内存的访问，大大提高性能，毕竟访问寄存器比访问内存快了一个数量级。比如上面 iload_2 就没必要将局部变量压到表达式栈上，因为这个局部变量是后面指令 iadd 的操作数，它压到表达式栈顶后随即就会被后面的 iadd 出栈，如此那还不如直接把 iload_2 的局部变量读取出来缓存到寄存器中，iadd 就可以直接从寄存器中读这个数据，省去了一个入栈和出栈的操作。

对于字节码指令来说，如果该指令有操作数（比如 iadd 就有两个操作数），并且在执行指令之前，操作数已经被缓存到寄存器了，那么就可以直接从寄存器中读操作数。否则，就需要从栈上将操作数弹出到寄存器。因此，一个字节码指令可能会有多个版本，比如一个是从寄存器获取操作数的版本，一个是从栈获取操作数的版本。这就是 dispatch_table 是二维数组的原因。

Hotspot 最多只会缓存一个栈顶数据，但缓存的数据类型会有多种：

```java
enum TosState {         // describes the tos cache contents
  btos = 0,             // byte, bool tos cached
  ztos = 1,             // byte, bool tos cached
  ctos = 2,             // char tos cached
  stos = 3,             // short tos cached
  itos = 4,             // int tos cached
  ltos = 5,             // long tos cached
  ftos = 6,             // float tos cached
  dtos = 7,             // double tos cached
  atos = 8,             // object cached
  vtos = 9,             // tos not cached
  number_of_states,
  ilgl                  // illegal state: should not occur
};
```

所以 dispatch_table 被定义为 ```_table[number_of_states][length]```，TosState 这个维度指的是字节码指令执行前，栈顶数据被缓存的状态。要注意，有些情况是不存在的，比如 istore 指令，执行该指令前缓存一个 double 数据是无意义的，或者说，执行 istore 时，栈顶或寄存器中一定是一个整数。因此 ```_table[dtos][istore_index]``` 这一项是不存在的，也就是说，```_table[number_of_states][length]``` 不是每一项都有意义的，但为了方便与高效，还是定义成二维数组。

字节码指令执行前的栈顶数据是什么状态呢？这个当然是由前一条指令决定的，比如执行 iadd 时，栈上一定是两个整型操作数，这两个整型操作数是前面两条 iload 指令压上去的。再考虑 Tos，则必定有一个操作数被缓存到寄存器，由于 Hotspot 只用到一个寄存器做缓存，所以另一个操作数还是只能在栈上。

在实现上，只要可能，Hotspot 就会缓存字节码执行后的栈顶数据，如果寄存器已经缓存了数据，则将寄存器中缓存的数据入栈，腾出寄存器来缓存新的数据。

每个字节码指令执行前后栈顶的数据都是确定的，比如 iload 指令将整型局部变量压到表达式栈，因此执行前 Tos 的状态应该是 vtos，表示执行前不依赖表达式栈上的数据，执行后 Tos 的状态是 itos，表示该指令执行后会将本该压到表达式栈顶的整型数据缓存到寄存器。

接着分析字节码的解释过程：

```cpp
void TemplateInterpreterGenerator::set_short_entry_points(Template* t, address& bep, address& cep, address& sep, address& aep, address& iep, address& lep, address& fep, address& dep, address& vep) {
  assert(t->is_valid(), "template must exist");
  switch (t->tos_in()) {
    case btos:
    case ztos:
    case ctos:
    case stos:
      ShouldNotReachHere();  // btos/ctos/stos should use itos.
      break;
    case atos: vep = __ pc(); __ pop(atos); aep = __ pc(); generate_and_dispatch(t); break;
    case itos: vep = __ pc(); __ pop(itos); iep = __ pc(); generate_and_dispatch(t); break;
    case ltos: vep = __ pc(); __ pop(ltos); lep = __ pc(); generate_and_dispatch(t); break;
    case ftos: vep = __ pc(); __ pop(ftos); fep = __ pc(); generate_and_dispatch(t); break;
    case dtos: vep = __ pc(); __ pop(dtos); dep = __ pc(); generate_and_dispatch(t); break;
    case vtos: set_vtos_entry_points(t, bep, cep, sep, aep, iep, lep, fep, dep, vep);     break;
    default  : ShouldNotReachHere();                                                 break;
  }
}

void TemplateInterpreterGenerator::generate_and_dispatch(Template* t, TosState tos_out) {
  int step = 0;
  if (!t->does_dispatch()) {
    step = t->is_wide() ? Bytecodes::wide_length_for(t->bytecode()) : Bytecodes::length_for(t->bytecode());
    if (tos_out == ilgl) tos_out = t->tos_out();
  }
  // 这里生成字节码解释子程序
  t->generate(_masm);
  if (t->does_dispatch()) {
    // 如果字节码本身会控制执行逻辑，那么执行该字节码后就不会返回了，因为接下来的逻辑被这个字节码接管了，比如 return 指令
    __ should_not_reach_here();
  } else {
    // 否则的话，需要显示指示继续执行下一条指令
    __ dispatch_epilog(tos_out, step);
  }
}

void TemplateInterpreterGenerator::set_vtos_entry_points(Template* t,
                                                         address& bep,
                                                         address& cep,
                                                         address& sep,
                                                         address& aep,
                                                         address& iep,
                                                         address& lep,
                                                         address& fep,
                                                         address& dep,
                                                         address& vep) {
  Label L;
  aep = __ pc();  __ push_ptr();   __ jmp(L);
  fep = __ pc();  __ push_f(xmm0); __ jmp(L);
  dep = __ pc();  __ push_d(xmm0); __ jmp(L);
  lep = __ pc();  __ push_l();     __ jmp(L);
  bep = cep = sep =
  iep = __ pc();  __ push_i();
  vep = __ pc();
  __ bind(L);
  generate_and_dispatch(t);
}
```

Template 是字节码的模板，字节码的解释子程序、执行前后依赖的 Tos 状态都在 Template 里，每个字节码都用一个 Template 来表示：

```cpp
void TemplateTable::initialize() {
  // For better readability
  const char _    = ' ';
  const int  ____ = 0;
  const int  ubcp = 1 << Template::uses_bcp_bit;
  const int  disp = 1 << Template::does_dispatch_bit;
  const int  clvm = 1 << Template::calls_vm_bit;
  const int  iswd = 1 << Template::wide_bit;
  //                                    interpr. templates
  // Java spec bytecodes                ubcp|disp|clvm|iswd  in    out   generator             argument
  def(Bytecodes::_nop                 , ____|____|____|____, vtos, vtos, nop                 ,  _           );
  def(Bytecodes::_aconst_null         , ____|____|____|____, vtos, atos, aconst_null         ,  _           );
  def(Bytecodes::_iconst_m1           , ____|____|____|____, vtos, itos, iconst              , -1           );
  def(Bytecodes::_iconst_0            , ____|____|____|____, vtos, itos, iconst              ,  0           );
  def(Bytecodes::_iload_1             , ____|____|____|____, vtos, itos, iload               ,  1           );
  def(Bytecodes::_iadd                , ____|____|____|____, itos, itos, iop2                , add          );
  ...
}
```

可以看到，iload_1 执行前的 tos 状态必须为 vtos，执行后的状态必须为 itos，它的解释子程序是 iload 这个函数负责。

```cpp
void TemplateTable::iload(int n) {
  __ movl(rax, iaddress(n));
}

static inline Address iaddress(int n) {
  return Address(rlocals, Interpreter::local_offset_in_bytes(n));
}
```

iload 的逻辑的确就是将第 n 个 locals 读取到 rax 寄存器中。

iload_1 执行前的 tos 状态为 vtos，假设 iload 前一条指令执行后 tos 状态为 vtos，则 iload_1 字节码解释子程序的生成过程如下（为了展示更清晰，函数的某些参数已经展开了，多余的代码也省略了）：

```cpp
void TemplateInterpreterGenerator::set_short_entry_points(Template* t, address& bep, address& cep, address& sep, address& aep, address& iep, address& lep, address& fep, address& dep, address& vep) {
  switch (t->tos_in()) {
    ...
    case vtos: set_vtos_entry_points(t, bep, cep, sep, aep, iep, lep, fep, dep, vep);     break;
    ...
  }
}

void TemplateInterpreterGenerator::set_vtos_entry_points(Template* t,
                                                         address& bep,
                                                         address& cep,
                                                         address& sep,
                                                         address& aep,
                                                         address& iep,
                                                         address& lep,
                                                         address& fep,
                                                         address& dep,
                                                         address& vep) {
  ...
  // 前一条指令执行后 tos 状态为 vtos，所以本条指令入口为 vep
  vep = __ pc();
  __ bind(L);
  generate_and_dispatch(t);
}

void TemplateInterpreterGenerator::generate_and_dispatch(Template* t, TosState tos_out) {
  __ movl(rax, iaddress(1));
  // 继续取下一条指令执行
  __ dispatch_epilog(itos, 1);
}
```

随后的 iload_2 字节码解释子程序的生成过程如下：

```cpp
void TemplateInterpreterGenerator::set_short_entry_points(Template* t, address& bep, address& cep, address& sep, address& aep, address& iep, address& lep, address& fep, address& dep, address& vep) {
  switch (t->tos_in()) {
    ...
    case vtos: set_vtos_entry_points(t, bep, cep, sep, aep, iep, lep, fep, dep, vep);     break;
    ...
  }
}

void TemplateInterpreterGenerator::set_vtos_entry_points(Template* t,
                                                         address& bep,
                                                         address& cep,
                                                         address& sep,
                                                         address& aep,
                                                         address& iep,
                                                         address& lep,
                                                         address& fep,
                                                         address& dep,
                                                         address& vep) {
  ...
  // 前一条指令 (iload_1) 执行后 tos 状态为 itos，所以本条指令入口为 iep
  // 这里会执行一个 push 操作把前一条指令缓存的栈顶数据压到栈上去，以腾出寄存器
  iep = __ pc();  __ push_i();
  ...
  generate_and_dispatch(t);
}

void TemplateInterpreterGenerator::generate_and_dispatch(Template* t, TosState tos_out) {
  __ movl(rax, iaddress(1));
  // 继续取下一条指令执行
  __ dispatch_epilog(itos, 1);
}
```

再然后是 iadd 的字节码解释子程序的生成过程：

```cpp
void TemplateInterpreterGenerator::set_short_entry_points(Template* t, address& bep, address& cep, address& sep, address& aep, address& iep, address& lep, address& fep, address& dep, address& vep) {
  switch (t->tos_in()) {
    ...
    // 前一条指令 (iload_2) 执行后 tos 状态为 itos，所以本条指令入口为 iep
    case itos: iep = __ pc(); generate_and_dispatch(t); break;
    ...
  }
}

void TemplateInterpreterGenerator::generate_and_dispatch(Template* t, TosState tos_out) {
  // iload_2 的结果已经缓存到 rax 寄存器了，iload_1 的结果还在栈上
  __ pop_i(rdx);
  __ addl (rax, rdx);
  // 继续取下一条指令执行
  __ dispatch_epilog(itos, 1);
}
```

最后再来张图吧：

<img src="/img/posts/how-jvm-interpreter-work-r3.png" os="mac"/>

每条指令执行完后，都会去方法区取下一个字节码，然后跳转到相应字节码的解释子程序执行，最后 return 的解释子程序限于篇幅没画出来，它会负责将文章上面部分说到的构建出来的栈销毁，然后返回前一个调用的方法，如果前面没有方法了（也就是说本方法是入口方法），那么该方法执行完后线程会退出。

## 参考资料
https://hllvm-group.iteye.com/group/topic/34814#post-231982
