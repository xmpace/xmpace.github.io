- 多版本数据写在哪？是先写在buffer中，还是直接往磁盘写？如果是写buffer，buffer满了如何处理？
- 事务提交时，redo log刷到磁盘与写binlog应该也有个一致性的问题，怎么实现的？二阶段提交？
- 写数据之前要写undo log，数据首先被写在操作系统cache中，可能随时被操作系统刷入磁盘，所以undo log必须持久化，那么undo log是如何持久化的？查到说undo log也会产生redo log来持久化，但redo log是在事务提交时要求写入磁盘，提交前可以不写入磁盘的，这里是怎么处理的？