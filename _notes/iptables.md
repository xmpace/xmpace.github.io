---
layout: post
title: "【笔记】iptables"
date: 2019-08-11
background: /img/bg-post.jpg
num: 1
---

## iptables

<img src="/img/posts/notes-iptables-1.png" width="100%" alt="iptables flow" />

上图是数据包的流动，如果不是发往本机的包，走的是中间的转发流程。否则走的是右边的流程。Linux 转发需要打开转发配置才可以。

{% highlight terminal %}
sysctl -w net.ipv4.ip_forward=1
sysctl -w net.ipv6.conf.all.forwarding=1
{% endhighlight %}

iptables 就是控制上图包流动的各个环节。

iptables 命令可以概括为：在某表的某链上，对满足指定规则的包做什么操作。**表和链是必须的选项，如果表选项忽略，默认为filter表。**

### 参数

| 参数 | 说明 |
| :--- | :--- |
| -A, \--append *chain rule-specification* | 规则添加到最后面（最前面的规则最先检查） |
| -D, \--delete *chain rule-specification* | 删除规则 |
| -D, \--delete *chain rulenum* | 按序号删除规则 |
| -I, \--insert *chain* \[*rulenum*\] *rule-specification* | 在指定位置插入规则，默认插入最前面 |
| -R, \--replace *chain rulenum rule-specification* | 替换规则 |
| -L, \--list \[*chain*\] | 查看规则 |
| -F, \--flush \[*chain*\] | 清空规则 |
| -Z, \--zero \[*chain*\] | 清空计数器 |
| -N, \--new-chain *chain* | 新建自定义链 |
| -X, \--delete-chain \[*chain*\] | 删除自定义链 |
| -E, \--rename-chain *old-chain new-chain* | 重命名自定义链 |
| -P, \--policy *chain target* | 给链设置默认策略 |

### 规则匹配参数

| 参数 | 说明 |
| :--- | :--- |
| -p, \--protocol \[!\] *protocol* | 协议，TCP、UDP、ICMP |
| -s, \--source \[!\] *address*\[*/mask*\] | 源 ip 地址 |
| -d, \--destination \[!\] *address*\[*/mask*\] | 目的 ip 地址 |
| -j, \--jump *target* | 匹配成功则跳转到目标，目标可以是自定义链、内置目标或插件。该参数省略的话则只计数 |
| -g, \--goto *chain* | 假设从 A 链执行 -j 跳到 B 链，再从 B 链执行 -g 跳到 C 链，那么从 C 链返回时，B 链后续不执行，跳到 A 链继续执行。如果 A 链也是 -g 跳的，那么继续再往上，一直到默认链策略为止 |
| -i, \--in-interface \[!\] *name* | 包流入的网络接口 |
| -o, \--out-interface \[!\] *name* | 包流出的网络接口 |
| \[!\] -f, \--fragment | 首包之后的包，IP 分片之后，只有首包有四层协议的头信息，后面的包都没有，因此根据端口之类的匹配，对于首包之后的包是无效的，所以得额外针对首包之后的包写匹配规则 |
| -c, \--set-counters *PKTS BYTES* | 设置计数器 |
| -n, \--numeric | IP 地址和端口显示为数字 |
| \--line-nubmers | 显示序号 |

## 匹配插件
匹配除了用选项提供的源目的 IP 地址等来匹配，还可以用功能强大的匹配插件来匹配，iptables 已经内置了许多匹配插件。要使用匹配插件，指定选项 -m 或 --match，后面跟插件名即可。如果指定了匹配插件，用 -h 或 --help 即可查看该插件的帮助。

插件都带有自己的选项，具体选项可从文档查询。

### 常用匹配插件

| 插件 | 说明 |
| :--- | :--- |
| conntrack | 根据连接状态匹配包，见下面说明 |
| iprange | ip 范围匹配 |
| multiport | 多端口匹配 |
| owner | 按包的发送进程或用户等匹配 |
| state | 连接状态匹配 |
| tcp | 匹配 tcp 协议，-p, \--protocol 选项同样的效果 |
| udp | 匹配 udp 协议，-p, \--protocol 选项同样的效果 |

**连接状态**

| 状态 | 说明 |
| :--- | :--- |
| NEW | 新建连接，比如收到 TCP 的 SYN 包后，连接状态就是 NEW 了。或者 iptables 只看到一个方向的包流，此时状态也是 NEW，比如 UDP，只收到对方发来的包 |
| ESTABLISHED | 连接建立，iptables 看到双向包流后进入该状态 |
| RELATED | FTP 关联连接 |
| INVALID | 非法连接状态 |

更多解释可参看 [http://people.netfilter.org/pablo/docs/login.pdf](http://people.netfilter.org/pablo/docs/login.pdf) state 一节

[https://linux.die.net/man/8/iptables](https://linux.die.net/man/8/iptables) 更多匹配插件查看 Match Extensions 一节

## 目标插件
与匹配插件一样，目标也有插件

### 常用目标插件

| 插件 | 说明 |
| :--- | :--- |
| DNAT | 修改包目的地址 |
| SNAT | 修改包源地址 |
| MASQUERADE | 特殊的 SNAT，网络包流出网卡的时候，用网卡的 IP 替换包源地址 |
| REDIRECT | 修改包的目的地址为入网卡地址，以将包重定向到本机 |
| REJECT | 拒绝包，不同协议包的拒绝策略不同 |

[https://linux.die.net/man/8/iptables](https://linux.die.net/man/8/iptables) 更多目标插件查看 Target Extensions 一节

## iptables 示例

{% highlight terminal %}
# 屏蔽 ip
iptables -t filter -I INPUT -s 59.45.175.62 -j REJECT

# 查看 rules
iptables -t filter -L INPUT --line-number

# 删除 filter 表 INPUT 链的第 1 条规则
iptables -t filter -D INPUT 1

# 丢弃源 ip 地址为 59.45.175.0/24 的 22 和 5901 端口上的 tcp 包
iptables -t filter -A INPUT -p tcp -m multiport --dports 22,5901 -s 59.45.175.0/24 -j DROP

{% endhighlight %}

## 参考
[An In-Depth Guide to iptables, the Linux Firewall](https://www.booleanworld.com/depth-guide-iptables-linux-firewall)