---
layout: post
title: "【笔记】pf"
date: 2019-08-17
background: /img/bg-post.jpg
---

## 规则语法
与 iptables 不同，pf 生效的是最后一条匹配规则，除非指定 quick 关键字。quick 指示 pf 立即生效当前规则，并停止执行后续规则。

### 过滤

{% highlight terminal %}
action [direction] [log] [quick] [on interface] [af] [proto protocol]
       [from src_addr [port src_port]] [to dst_addr [port dst_port]]
       [flags tcp_flags] [state]
{% endhighlight %}

### NAT

{% highlight terminal %}
nat [pass] [log] on interface [af] from src_addr [port src_port] to \
        dst_addr [port dst_port] -> ext_addr [pool_type] [static-port]
{% endhighlight %}

## Cheat Sheet

{% highlight terminal %}

# Load the pf.conf file
pfctl -f  /etc/pf.conf

# 192.168.0.0/24 发往 192.168.0.1 的包放行
pass in  on dc0 from 192.168.0.0/24 to 192.168.0.1

# 192.168.0.1 发往 192.168.0.0/24 的包放行
pass out on dc0 from 192.168.0.1 to 192.168.0.0/24

# 屏蔽 8.8.8.8 发过来的包
block in on dc0 from 8.8.8.8 to any 192.168.0.1/24

# 重定向 80 端口的 tcp 流量到 192.168.1.20 的 80 端口
rdr on tl0 proto tcp from any to any port 80 -> 192.168.1.20

{% endhighlight %}

## 其他
MacOS 打开包转发功能
```
sudo sysctl -w net.inet.ip.forwarding=1
```

加载 pf 规则
1. 关闭 pf
```
sudo pfctl -d
```

2. 加载规则
```
sudo pfctl -f ~/pf.conf
```

3. 启动 pf
```
sudo pfctl -e
```

## 官方文档
OpenBSD 的 pf 与 MacOS 的 pf 有所不同，查资料的时候要注意区分。
[OS X PF Manual](https://murusfirewall.com/Documentation/OS%20X%20PF%20Manual.pdf)
