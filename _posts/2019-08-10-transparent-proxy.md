---
layout: post
title: "如何使用透明代理抓 HTTPS"
excerpt: "要抓 HTTPS 很容易，但有些情况下只能使用透明代理来抓"
background: img/bg-post.jpg
---

## 什么是透明代理
透明代理，顾名思义，就是对客户端来说是透明的，客户端感知不到代理的存在。我们平时用 Charles 抓包，一般都不是透明代理模式，因为我们要在客户端明确设置代理才行。

<div align="center"><img src="/img/posts/transparent-proxy-1.jpeg" width="50%" alt="Charles" /></div>

## 为什么要用透明代理
普通代理需要在客户端设置，但有些情况下我们没办法设置客户端，或者有些 App 的代码直接忽略代理，设置了也没用，所以这种情况下只能用透明代理。

## Mac 上搭建透明代理
接下来，我们在 Mac 上用 mitmproxy 来搭建一个透明代理，为啥不用最常用的 Charles 呢？后面我再来讲原因。

### 1.Mac 打开热点 WiFi

<img src="/img/posts/transparent-proxy-2.png" width="100%" alt="access point" />

手机连接到该热点 WiFi。

### 2.流量转发
现在手机的流量都会从 Mac 过，但要如何配置才能让流量从 Mac 上的 mitmproxy 过呢？Mac 上的热点 WiFi 不支持设置代理，我们只能通过其他方法来重定向流量。Linux 上有 iptables，Mac 没有，但 Mac 上有相似的 pf，通过 pf 可以设置将热点 WiFi 的流量转发到代理的端口上。
设置方法可以参考 mitmproxy 官网文档（[点击这里查看](https://docs.mitmproxy.org/stable/howto-transparent/#macos)），这里就不多说了。

### 3.安装证书
如果 pf 配置正确的话，现在在手机浏览器上打开 mitm.it 就可以看到证书安装界面了，下载对应平台的证书安装即可。

好了，以上配置都正确的话，可以打开 mitmproxy 查看 HTTPS 流量了。

<img src="/img/posts/transparent-proxy-3.png" width="100%" alt="mitmproxy" />

## 为什么不能用 Charles
Charles 非常好用，但用做透明代理时，HTTPS会报 Invalid first line in request 的错误。为什么呢？

<img src="/img/posts/transparent-proxy-4.png" width="100%" alt="charles 503" />

假设我有一台 IP 为 88.88.88.88 的服务器，我在上面搭了两个网站 yema.com 和 maye.com，用 Nginx 来做反向代理，那么，当我收到一个 HTTP 请求，我怎么知道它是想请求 yema.com 呢，还是想请求 maye.com 呢？域名的信息，在 DNS 解析后其实就丢了，变成 IP 了，但 HTTP/1.1 协议会将域名放在请求头的 Host 字段中，Nginx 正是从这个字段得知请求要访问哪个网站的。

好，现在再来看看 HTTPS 的情况，建立 TCP 连接后开始 TLS 握手，服务器要向客户端出示证书，但是 TLS 协议并不是专门为 HTTP 设计的，像其他的 FTP SMTP 等都可以跑在 TLS 上，所以 TLS 握手并不会像 HTTP 那样带 Host 头，因此服务器也就不知道到底该出示谁的证书了。

当我们使用透明代理后，透明代理充当了这个服务器的角色，因此也会遇到上面的问题。

但是，为什么 Charles 用非透明代理模式却可以抓到 HTTPS 呢？这是因为非透明代理，并不是单纯对流量的转发，它会先发一个 CONNECT 的 HTTP 请求给代理，代理收到后再建立与目标服务器的连接，通过这个 CONNECT 请求，代理就可以拿到 HTTPS 的 Host 了。这也是为什么我们经常在 Charles 里看到 CONNECT 请求的原因。

那么 HTTPS 就没法透明代理了吗？不是，为了解决 TLS 握手不带 Host 的问题，TLS 提出了一个扩展 SNI (Server Name Indication)，也就是像 HTTP 那样，在握手的时候让客户端把 Host 给带上。其实目前 SNI 已经被各大浏览器厂商广泛支持了，Charles 无法透明代理 HTTPS 的原因是 Charles 不支持 SNI，它不会去分析 TLS 握手包中的 SNI 携带的 Host。这就是为什么本文用 mitmproxy 而不用 Charles 的原因。

## 多级代理设想
我能不能先用 mitmproxy 做透明代理，再给 mitmproxy 设置一个 Charles 做上级代理呢？查看 mitmproxy 文档，发现并没有透明代理与上级代理的组合选项。搜了一下，发现很早就有人提出了这个需求，只是到目前为止，mitmproxy 仍然没有开发这个特性。
[https://github.com/mitmproxy/mitmproxy/issues/2813](https://github.com/mitmproxy/mitmproxy/issues/2813)
[https://github.com/mitmproxy/mitmproxy/issues/2400](https://github.com/mitmproxy/mitmproxy/issues/2400)

## 参考
[https://serverfault.com/questions/369829/setting-up-a-transparent-ssl-proxy](https://serverfault.com/questions/369829/setting-up-a-transparent-ssl-proxy)
