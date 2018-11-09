---
title: 在 IPFS 上部署静态博客
tags:
  - IPFS
date: 2018-09-22 21:12:00
---


本文主要记录在 IPFS 上部署博客的过程，用以熟悉 IPFS 的基本操作。https://ipfs.0ranga.com 就是博主博客在 IPFS 上部署的版本。

<!--more-->

## IPFS 

### 安装 IPFS
首先得在计算机上安装 IPFS，博主 PC 的操作系统的 Arch，可以直接使用包管理器进行安装。如果之后需要为博客添加域名则需要在云服务器上部署 IPFS，博主选择的是 DightOcean 的 CentOS 7。所以提供了以上两种操作系统的安装方式，其他系统如何安装请自行探索。
``` sh
# Arch
## 包管理器直接安装
pacman -S go-ipfs 

# CentOS
## 从 https://dist.ipfs.io/#go-ipfs 获取最新安装包，例如
wget https://dist.ipfs.io/go-ipfs/v0.4.17/go-ipfs_v0.4.17_linux-amd64.tar.gz

## 解压
tar xvfz go-ipfs_v0.4.17_linux-amd64.tar.gz

## 安装
cd go-ipfs && ./install.sh
```

安装完成后需要先初始化 IPFS
``` sh
ipfs init
```
另外，一般在云服务器上需要将 IPFS 设置为自启动服务，设置方式如下，首先需要添加 service 描述文件
``` sh
vi /etc/systemd/system/ipfs.service
```
文件内容如下：
``` service
[Unit]
Description=IPFS Daemon

[Service]
Type=simple
ExecStart=/usr/local/bin/ipfs daemon --enable-namesys-pubsub

[Install]
WantedBy=multi-user.target
```
然后使服务开机自启动同时立即启动：
``` sh
systemctl enable ipfs
systemctl start ipfs
```
### 部署一个文件
接下来在本地创建一个文件 `index.html`，在里面写入简单的话
``` sh
echo 'hello, my simple blog!' > index.html
```
随后添加至 IPFS 中
``` sh
ipfs add index.html
```
得到返回如下
``` sh
ipfs add index.html 
# added QmaqwGFUj34wDLPzHVxmJhEN6n27xidsfrmf2WUnhSTKTr index.html
# 23 B / 23 B [=========================================] 100.00%
```
可以通过如下命令查看文件内容
``` sh
ipfs cat QmaqwGFUj34wDLPzHVxmJhEN6n27xidsfrmf2WUnhSTKTr
```
当我们使用如下命令启动节点后，文件内容将会逐渐被 IPFS 网络存储
``` sh
ipfs daemon
# 或者
systemctl start ipfs
```
随后可以通过访问 https://gateway.ipfs.io/ipfs/QmaqwGFUj34wDLPzHVxmJhEN6n27xidsfrmf2WUnhSTKTr 得到该文件。如果你不介意将这句简单的话作为你的博客的全部内容的话，那至此博客的全部创建完成了，而且理论上永远不会消失。

## 部署静态博客框架：以 Hexo 为例
虽然小标题写的是“以 Hexo 为例”，但本文不会细讲如何使用 Hexo，[Hexo 官方文档](https://hexo.io/zh-cn/docs/)提供了细致的帮助。如果你之前用过 Hexo 而且因为懒得写作而把它丢弃在硬盘里，这里有几个命令可以帮助你快速回想起使用方法。
``` sh
# 创建新文章
hexo new post <new_post_name>
# 清理
hexo clean
# 生成博客
hexo g
# 启动本地服务器
hexo s --open
# 部署
hexo d
```
在使用 `hexo g` 生成静态博客后，我们可以在 **public** 目录中找到部署博客需要的所有文件，入口是熟悉的 **index.html**。（其他博客框架也有个类似 public 的文件夹用于存放整个博客）

使用如下命令将整个 public 文件夹放入 IPFS
``` sh
ipfs add -r public
```
添加后的输出中最后一行是目录 public 的哈希值，比如博主得到的是
``` sh
# added QmSc5D1ahPbVkAhHFxJvqnWDEWrgMQw9B9BGmQv5i1VAwt public
```
然后访问 https://gateway.ipfs.io/ipfs/QmSc5D1ahPbVkAhHFxJvqnWDEWrgMQw9B9BGmQv5i1VAwt/ 就可以看到保存在 IPFS 上的博客了。不过，在修改文章更新 public 目录之后，目录的哈希值会变化，因此以上的连接只是博客在当前的一个（永久）状态，如果想要通过一个链接访问不断更新的博客，就需要借助 IPNS，IPNS 的作用就是将某个文件与 PeerID 进行绑定，一般情况下，PeerID 可以保持不变，这样，通过访问 PeerID，就可以访问与 PeerID 绑定的内容了，这和 DNS 中域名与 IP 的关系类似。

通过以下命令将当前的 public 目录哈希与 PeerID，PeerID 不需要显示指定，得到绑定结果后的 PeerID 实际上与通过 `ipfs id` 命令得到的 ID 一致。
``` sh
# 绑定
ipfs name publish <file_hash>
ipfs name publish QmSc5D1ahPbVkAhHFxJvqnWDEWrgMQw9B9BGmQv5i1VAwt

# 绑定后的输出
# Published to QmRP5ZT2B5W8zWTXhPwpgZQpuj8Gv5bNaXWbttRB6niAYo:
# /ipfs/QmSc5D1ahPbVkAhHFxJvqnWDEWrgMQw9B9BGmQv5i1VAwt

# 访问（列出目录） IPNS QmRP5ZT2B5W8zWTXhPwpgZQpuj8Gv5bNaXWbttRB6niAYo
ipfs ls /ipns/<peer_id>
ipfs ls /ipns/QmRP5ZT2B5W8zWTXhPwpgZQpuj8Gv5bNaXWbttRB6niAYo

# 反向解析
ipfs name resolve <peer_id>
ipfs name resolve QmRP5ZT2B5W8zWTXhPwpgZQpuj8Gv5bNaXWbttRB6niAYo
```
绑定 IPNS 之后，可以通过 https://gateway.ipfs.io/ipns/QmRP5ZT2B5W8zWTXhPwpgZQpuj8Gv5bNaXWbttRB6niAYo/ 访问到博客。

**但是直接部署 public 目录存在一个问题**：hexo 这类的博客中所有本地资源的路径均为根目录开头的相对站点根目录的绝对路径，例如对于 `/css/home.css`，当访问 `https://gateway.ipfs.io/ipfs/<file_hash>` 这样在文件中有类似绝对路径链接时，相当于访问 `https://gateway.ipfs.io/css/home.css`，显然这个 `home.css` 文件是不存在的。如果想要使得网站可以正确访问，有两种解决办法：
1. 使用相对路径 `./css/home.css`，这样就相当于访问 `https://gateway.ipfs.io/ipfs/<file_hash>/css/home.css`，如此可以正确访问。如果博客框架自身支持将所有本站资源的绝对路径替换成这样，或者整个博客是自己实现如此，那不需要额外的操作就可以得到一个完美的博客。
2. 让 `http://gateway.site/css/home.css` 真实存在，即将 `http://gateway.ipfs.io/ipfs/<file_hash>` 替换成一个独立域名 `http://gateway.site`，这就需要用到 IPFS 提供的 [dnslink](https://github.com/ipfs/go-dnslink) 增强。

## 为博客添加域名
还是以我自己的域名 0ranga.com 为例，这个域名托管在 Namecheap 上，使用 Namecheap 的 DNS 管理，可以为域名增加一个子域名 TXT 记录如下：
``` sh
TXT 0ranga.com dnslink=/ipns/QmRP5ZT2B5W8zWTXhPwpgZQpuj8Gv5bNaXWbttRB6niAYo
```
这样，我们可以通过地址 https://gateway.ipfs.io/ipns/0ranga.com 访问到部署在 IPFS 上博客。我们还可以进一步缩短访问链接长度，在 DNS 管理中进一步添加如下记录（为了不与原博客 0ranga.com 冲突，这里使用子域名 ipfs.0ranga.com）：
```
# 1. 为子域名 ipfs.0ranga.com 添加 A 记录，绑定到一个 Gateway 的 IP，
#    示例中是 209.94.78.78 ，这个 IP 是 gateway.ipfs.io 的众多 IP 中的一个
A ipfs.0ranga.com 209.94.78.78

# 2. 为子域名 ipfs.0ranga.com 添加 TXT 记录，指定 IPNS
TXT ipfs.0ranga.com dnslink=/ipns/QmRP5ZT2B5W8zWTXhPwpgZQpuj8Gv5bNaXWbttRB6niAYo
```
等待 DNS 记录生效后，可以通过 http://ipfs.0ranga.com 访问博客。至此，博客的短链接改造已经基本完成。接下来会记录些自己另外的一些尝试，包括对博客的访问进行加速等。

## 进阶
### 部署云服务器以增强博客的可用性同时加快访问速度
如果部署了博客的本地 PC 关机，同时博客的访问量不是那么可观，则可能存在一部分博客文件无法访问的情况，因为在没有激励的情况下 IPFS 上的其他节点一般不会主动存储其他用户往 IPFS 中添加的文件。所以配置一个云服务器来存储博客本身就可以确保文件的可用性（请问：那为什么还要用 IPFS 来部署博客？），同时随着 FileCoin 激励与 IPFS 的结合，事情会变得不那么糟糕。

云服务部署的步骤如下：
1. 按照**安装 IPFS** 这小节中的安装方法在云服务器上部署一个 IPFS 服务；

2. 为了 Gateway 可以被公网访问，需要将 IPFS 配置文件 `～/.ipfs/config` 中 `Addresses:Gateway` 的配置改为 `/ip4/0.0.0.0/tcp/80` ，用以监听所有网卡上的 TCP 80 端口，随后重启 IPFS 服务使配置生效；

4. 通过本地浏览器直接访问云服务器的 IP （博主目前测试使用的服务器实例的 IP 为 `104.248.70.88`）结果为 **404 page not found** ，则表明服务部署成功。进一步，访问 http://104.248.70.88/ipfs/QmaqwGFUj34wDLPzHVxmJhEN6n27xidsfrmf2WUnhSTKTr 可以得到 **部署一个文件** 这节中的 **index.html** 文件，至此完成了 IPFS Gateway 的部署与共享；

5. 为 Gateway 绑定域名。类似之前的做法，添加一条 DNS A 记录。待记录生效后，访问连接变为 http://gateway.0ranga.com/ipfs/QmaqwGFUj34wDLPzHVxmJhEN6n27xidsfrmf2WUnhSTKTr
``` sh
A gateway.0ranga.com 104.248.70.88
```

6. 改用自己的 Gateway。将之前配置的子域名 ipfs.0ranga.com 的 A 记录对应的 IP 改成云服务器的 IP（TXT 记录保持不变），当浏览器访问 ipfs.0ranga.com 这个域名时，首先会访问 104.248.70.88 这台 Gateway 服务器，Gateway 再向整个 IPFS 网络收集当前页面的碎片；
``` sh
A ipfs.0ranga.com 104.248.70.88
```

7. 通过 Pin 操作将本地博客 public 目录”钉“至云服务器 IPFS 节点，然后将 public 目录哈希绑定至云服务器中 IPFS 的 PeerID，另外记得修改子域名 ipfs.0ranga.com 的 TXT 记录中的 IPNS 地址。此后即使关闭本地 PC 的 IPFS 服务，部署在 IPFS 上博客也可以被正常访问，访问地址依然是 http://ipfs.0ranga.com；
``` sh
ipfs pin add QmSc5D1ahPbVkAhHFxJvqnWDEWrgMQw9B9BGmQv5i1VAwt
```
8. 如果觉着同步文件至云服务器，而又不介意一直运行本地 PC 的 IPFS 服务，但是博客的访问速度又不快，可以考虑使用以下方式将云服务器上 IPFS 节点直接加入到本地 Peer 列表中，这样可以帮助云服务器上的 IPFS 节点快速找到本地 PC IPFS 节点中的博客文件。
``` sh
ipfs swarm connect /ip4/104.248.70.88/tcp/4001/ipfs/QmamxGp6sw2dKUHm2RnaJ7zRDeR3w8m98kKAYgfpszeqHR
```

### HTTPS 加持
在云服务器 CentOS 系统上安装 Nginx 服务，然后使用 Certbot 生成 Let's Encrypt 证书，过程比较简单，Certbot 的安装在[官方教程](https://certbot.eff.org/lets-encrypt/centosrhel7-nginx)有详细的说明，此处省略。最终，子域名 ipfs.0ranga.com 的 Nginx 的配置大致如下：
``` conf
server {
    server_name  ipfs.0ranga.com;

    location / {
            proxy_pass http://localhost:8080/;
            proxy_set_header Host $host;
            proxy_buffering off;
            proxy_pass_request_headers on;
    }


    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/ipfs.0ranga.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/ipfs.0ranga.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
server {
    if ($host = ipfs.0ranga.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen       80 default_server;
    server_name  ipfs.0ranga.com;
return 404; # managed by Certbot
}
```
注意，由于端口由 Nginx 进行控制， Gateway 不能再占用 80 端口，因此这里将其（`～/.ipfs/config` 中 `Addresses:Gateway` 配置）重新设定为 8080。gateway.0ranga.com 的 Nginx 配置也是类似。Hurray！现在我们可以通过 https://ipfs.0ranga.com 访问博主部署在 IPFS 上的博客，通过 https://gateway.0ranga.com 访问博主的 Gateway 了。

## 总结
可以用以下几个网址进行总结：

| 序号                                                       | 链接                                                         | 改进之处                          |
| ------------------------------------------------------------ | ----------------------------- | ----------------------------- |
| 1 | https://gateway.ipfs.io/ipfs/<root_path_hash>/ | 原始博客目录                  |
| 2 | https://gateway.ipfs.io/ipns/<peer_id>/ | IPNS 映射目录，站点更新时链接保持不变 |
| 3                     | https://gateway.ipfs.io/ipns/0ranga.com                      | dnslink 绑定，增加链接可读性  |
| 4                                      | http://ipfs.0ranga.com                                       | 实现完全自定义域名            |
| 5                                     | https://ipfs.0ranga.com                                      | 为域名添加 HTTPS 证书         |


## 参考资料
1. https://michalzalecki.com/set-up-ipfs-node-on-the-server/
2. https://github.com/ipfs/notes/issues/39
3. https://www.cloudxns.net/Support/detail/id/304.html
4. https://ipfs.io/ipns/Qme48wyZ7LaF9gC5693DZyJBtehgaFhaKycESroemD5fNX/post/putting_this_blog_on_ipfs/