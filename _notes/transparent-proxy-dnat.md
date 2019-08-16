---
layout: post
title: "【笔记】透明代理是如何知道包的原目的地址的？"
date: 2019-08-16
---

搭建透明代理时，会用到iptables对流量重定向。

{% highlight terminal %}
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 8080
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-port 8080
{% endhighlight %}

REDIRECT 其实就是 DNAT 的一个特殊版本，它会将包的目的 IP 地址修改为本机，然后将包转发到本机的透明代理端口上。这里问题就来了？既然包的目的 IP 地址已经被修改了，那么透明代理拿到这个包的时候，再继续对该包转发的时候，它是从哪里拿到这个包原来的目的 IP 地址的呢？

答案是从 SO_ORIGINAL_DST 的 socket option 中拿到的。
[https://unix.stackexchange.com/questions/166692/how-does-a-transparent-socks-proxy-know-which-destination-ip-to-use](透明代理是怎么拿到原目的 IP 地址的)