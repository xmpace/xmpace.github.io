
_java_mirror 指向持有该方法的对象，这个实例是个 oopDesc 的结构，没加锁时结构中的 _mark 最低位为 1，锁操作就是用原子操作设置 _mark，加锁时，将 _mark 指向本线程栈上分配的锁对象地址（由于栈上的锁对齐了，所以最低位不为 1）。可重入锁的实现，就是判断 _mark 指向的锁对象是不是在本线程的栈上，通过判断 _mark 与 rsp 的相对位置就能判断出来，Hotspot 源码中的判断条件是这样的：
file: interp_masm_x86.cpp
1170    //  1) (mark & zero_bits) == 0, and
1171    //  2) rsp <= mark < mark + os::pagesize()
第一个约束条件，是因为锁对象在栈上分配时是对齐了的，第二个约束条件，大于等于 rsp 很好理解，但小于 mark + os::pagesize() 不太理解，按我的理解，应该是小于最近的 pagesize 对齐的地址，因为，栈是按最小单位页来分配的，所以 mark 和 rsp 在同一页内才能百分百确定 mark 是本线程加的锁。但源码中的判断却是 mark + os::pagesize()，这样，mark 有可能在 rsp 所在的前一个页中，两者不在一个页内，据此，我只能猜测线程栈的第一个页也许有特殊用途，这个只能留待以后在源码中找答案了。

```
    const int zero_bits = LP64_ONLY(7) NOT_LP64(3);

    // Test if the oopMark is an obvious stack pointer, i.e.,
    //  1) (mark & zero_bits) == 0, and
    //  2) rsp <= mark < mark + os::pagesize()
    //
    // These 3 tests can be done by evaluating the following
    // expression: ((mark - rsp) & (zero_bits - os::vm_page_size())),
    // assuming both stack pointer and pagesize have their
    // least significant bits clear.
    // NOTE: the oopMark is in swap_reg %rax as the result of cmpxchg
    subptr(swap_reg, rsp);
    andptr(swap_reg, zero_bits - os::vm_page_size());
```

顺便说下源码中这段代码，`andptr(swap_reg, zero_bits - os::vm_page_size())` 这一句，其实要写成 `andptr(swap_reg, - os::vm_page_size() + zero_bits)` 这样会更好理解，-os::vm_page_size() 的补码形式，就是低位全为 0，高位全为 1，表示要检测待测数值是否在一页内。加上 zero_bits，即低 zero_bits 位全为 1，表示要检测低 zero_bits 位，要确保待测数值的 zero_bits 位为 0。