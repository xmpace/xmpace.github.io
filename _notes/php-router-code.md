---
layout: post
title: "【笔记】PHP Web 项目路由代码阅读"
date: 2019-08-18
background: /img/bg-post.jpg
---

本家是Java，有时候需要读一些 PHP 代码，记一下碰到的一个 Web 工程的代码框架。

PHP 的 Web 工程不同于 Java，PHP 本身没有 Web 服务组件，因此，PHP是通过 CGI 来接收和响应 HTTP 请求的。一般的部署结构是将 PHP 代码与一个 Web Server (比如 Nginx) 部署在同一台机器上，Web Server 中通过配置 CGI 将 URI 路径路由到 PHP 脚本，PHP 脚本从 CGI 协议中读取 HTTP 请求参数，处理完后再通过 CGI 协议传回 HTTP 响应。

一个典型的 Nginx CGI 配置如下:
```nginx
server {
listen         80 default_server;
listen         [::]:80 default_server;
server_name    example.com www.example.com;
root           /var/www/example.com;
index          index.html;

  location ~* \.php$ {
fastcgi_pass unix:/run/php/php7.0-fpm.sock;
include         fastcgi_params;
fastcgi_param   SCRIPT_FILENAME    $document_root$fastcgi_script_name;
fastcgi_param   SCRIPT_NAME        $fastcgi_script_name;
  }
}
```

传统的 CGI 接收程序每个请求都会开一个进程，性能堪忧，所以 PHP 开发了一个基于进程池的 CGI 接收程序，叫 PHP-FPM (PHP FastCGI Process Manager)。fastcgi_pass配置的即是 PHP-FPM 的监听端口，这里是从 SOCK 监听的，也可以配置从 TCP 端口监听。$fastcgi_script_name 即是 URI 中 php 前面的文件名，比如请求的是 /api.php，那么 $fastcgi_script_name 就是 api，再拼接上 $document_root 路径，这个请求就会被转发到 $document_root/api.php 脚本处理。

在我接手的这个 PHP 工程里，请求都会转发到了一个统一的入口脚本 /webroot/index.php，代码如下：
```php
<?php

ControllerFront::getInstance()->dispatch();
```

```php
public function dispatch()
{
    try {
        $this->beforeDispatch();
        $request = $this->createRouter()->dispatch();
        $this->afterDispatch($request);
        ActionBase::runAction($request);
    } catch (PageMovedException $e) {
        header('Location: ' . $e->url, true, $e->http_response_code);
    } catch (PageNotFoundException $e) {
        $this->doIfPageNotFound($e);
    }
}
```

```php
public static function runAction(RequestBase $request)
{
    $action = static::getActionByRequest($request);
    $action->run();
}
```

```php
protected static function getActionByRequest(RequestBase $request)
{
    $actionPath = $request->getActionPath();
    if (!file_exists($actionPath)) {
        throw new PageNotFoundException('FILE_NOT_EXIST ' . $actionPath, '', false);
    }
    require_once($actionPath);

    $actionClass = $request->getActionClass();
    $className = $actionClass . 'Action';
    $methodName = $request->getActionMethod();
    if ($methodName == false) {
        throw new PageNotFoundException('VISIT_POST_ACTION_VIA_GET ' . $actionPath, '', false);
    }

    return new $className($request);
}
```

也就是将 url 的各个部分分别解析为 class 和 method 并执行调用。