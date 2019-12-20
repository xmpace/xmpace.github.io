在 32 位系统中，long long 也是 64 位（C99 规定 long long 至少 64 位），jlong 类型正是 long long，那么，如何将内存中的 long long 原子性地移动到另一个内存位置呢？

in file bsd_x86_32.s
```
        # Support for jlong Atomic::load and Atomic::store.
        # void _Atomic_move_long(volatile jlong* src, volatile jlong* dst)
        .p2align 4,,15
        ELF_TYPE(_Atomic_move_long,@function)
SYMBOL(_Atomic_move_long):
        movl     4(%esp), %eax   # src
        fildll    (%eax)
        movl     8(%esp), %eax   # dest
        fistpll   (%eax)
        ret
```

指令 `.p2align x,y,z` 的含义：填充后，地址的低 x 位为 0，用 y 来填充，如果省略 y，则自动填充，填充策略是代码段用 no-op 指令填充，其它段用 0 填充，z 表示最多填充多少个字节。

用 `.p2align 4,,15` 举例，表示填充后，地址低 4 位为 0，也就是说地址是 16 字节对齐的，用 no-op 填充空位，最多填充 15 个字节（64 位对齐，最多只需要填充 15 字节个 no-op）。

再来说上面实现原子 move 的指令，这里借助了一个 64 位的寄存器 FPU，将 long long 的 src 先 load 到 FPU 寄存器，然后从 FPU 寄存器 store 到 dst，注意，这里内存地址仍然是 32 位的，只是地址上的数是 64 位的 long long，不要搞混了。