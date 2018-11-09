---
title: BT 系列之 Tracker
tags:
  - BT
date: 2018-08-27 00:00:00
categories:
---

本文是 BT 系列文章中的一篇，主要介绍种子文件结构与磁力链接的原理，有需要的话可以先阅读博文{% post_link bt-overview %}。

p2p 是 peer-to-peer 的缩写，为了让网络中的一个 peer 如何才能找到另外志同道合的 peer，Tracker 扮演着至关重要的月老作用。Tracker 是一个 HTTP 或者 UDP 服务器，作用是帮助 peer 找到其他拥有相同资源的 peer。

后来有了 DHT 网络之后，Tracker 的作用逐渐弱化，但是 Tracker 代表的这种中心化一定程度上相对 DHT 代表的去中心化效率还是比较高的。如同在概述前言中所说的一样，”过时“的技术某些情况下是会“复活"的，所以了解一下 Tracker 的工作原理并不是坏事。

## HTTP Tracker
HTTP Tracker 处理的来自 peer 的 GET 请求包括以下参数：
 - **info_hash**：即需要下载的资源的 torrent 文件的 info 部分的 SHA1 值，或者磁力链接中的 xt 值。
 - **peer_id**：标示这个客户端的字符串，一般会包含客户端的版本信息以及随机数据（[BEP20 - Peer ID Conventions](http://www.bittorrent.org/beps/bep_0020.html)）。
 - **ip**：可选，peer 的 IP。
 - **port**：可选，peer 监听的端口，一般是 6881。理论上 Tracker 应该需要对这个 ip 和 port 的组合进行 NAT 检查。
 - **uploaded**：该资源至今为止的上传字节数。
 - **downloaded**：该资源至今为止的下载字节数。
 - **left**：该资源剩余未完成下载的字节数。
 - **event**：可选，当前资源下载状态，可以是`started`，`completed`，`stopped`，每次发生状态变化时进行通告。

这个请求的回复是使用 bencode 编码的字典，有如下的键：
 - **failure reason**：字符串，如果请求失败就会有这个键，表示失败的原因，另外 [BEP31 - Failure Retry Extension](http://www.bittorrent.org/beps/bep_0031.html) 中定义了一个 **retry in** 字段来告知发起请求的 peer 重试间隔分钟数，或者永远不进行重试。如果成功就会有以下两个键。
 - **interval**：整型，告知 peer 之后进行 GET 请求的时间间隔，但是如果 peer 的状态发生变化或者需要从 Tracker 获取更多的 peer 就会不管这个时间间隔限制而直接重新请求。
 - **peers**：列表，每个子项都是字典，字典的键分别为 **id**，**ip**，**port**，分别与 GET 请求中的 peer_id，ip，port 含义一致，用于唯一确定每个其他 peer。

在 HTTP Tracker 的 URL 上进行适当的改造可以得到 Scrape URL（在 [BEP48 - Tracker Protocol Extension: Scrape](http://www.bittorrent.org/beps/bep_0048.html) 中提出）。通过请求 Scrape URL 可以得到指定 info_hash 的当前 peers 的大致统计信息，包括处于活跃状态且已完成下载（**complete**）的 peer 数量、处于活跃状态但未完成下载（**incomplete**）的 peer 数量、曾经完成过下载（**downloaded**）的 peer 数量。支持同时请求多个 info_hash 。这些数据帮助 peer 决定是否应该执行 Tracker GET 请求，从而一定程度上减小 HTTP Tracker 服务器的压力。

而 UDP 本身比 HTTP 消耗更小些，且直接实现了 Scrape 请求。

## UDP Tracker
由于 HTTP 是基于 TCP 的，连接的打开和关闭会带来一定损耗。这种类似的发现服务使用 UDP 可以大大降低 Tracker 服务器的压力。[BEP15 - UDP Tracker Protocol](http://www.bittorrent.org/beps/bep_0015.html) 提出了基于 UDP 的 Tracker 方案。

为了防止 UDP Flood 攻击，peer 与 UDP Tracker 的通信会首先通过 **connect** 动作进行类似 TCP 的三次握手，约定一个 connection_id，之后所有的动作都会使用这个 connection_id。**announce** 动作可以向 UDP Tracker 完成类似对 HTTP Tracker 的 GET 请求。使用 **scrape** 动作完成类似对 HTTP Tracker 的 Scrape 请求。如果出现错误，Tracker 会触发 **error** 动作。

GET 请求如果需要扩展参数只需要在请求的 URL 中增加相关的参数即可，在 UDP Tracker 中，实现这种增加参数的可扩展性则需要另外想办法。[BEP41 - UDP Tracker Protocol Extensions](http://www.bittorrent.org/beps/bep_0041.html) 对于其实现方案举了一个这样的例子：一个 Tracker 服务器想要提高它的运行效率而限制其所能服务的 info_hash，他们考虑在在 peer 对 Tracker 的 URL 中加入一个 auth 字段，即该 info_hash 的签名，这样的情况下，Tracker 可以通过 Torrent 或者 Magnet 发布这个带有 info_hash 签名的 Tracker URL，peer 对该 Tracker 的请求时带上该签名，Tracker 就可以验证这个签名是否与 info_hash 相匹配以及这个 info_hash 是否在其服务的范围，从而实现限制。

比如 Tracker 在一个 Magnet 中附加的 tr 参数如下，auth 字段就是指的 info_hash 的示例签名：
```
udp://tracker.example.com:80/?auth=0xA0B1C
```
实现 BEP41 方案后的客户端在对 UDP Tracker 发起 **announce** 请求动作时，会在包体尾部添加如下字节：
```
0x2, 0xC, '/', '？', 'a', 'u', 't', 'h', '=', 'A', '0', 'B', '1', 'C', 0x1, 0x1, 0x0
```
`0x2` 表示附加的选项类型是 **URLData**，这个选项会紧跟着两个参数，`0xC` 表示后面的内容长度为 12，后续的 12 字节就是 URLData 的内容；`0x1` 表示附加的选项类型是 **NOP** ,即填充字节，连续两个 `0x1` 表示填充两个字节，`0x0` 表示附加的选项类型是 **EndOfOptions**，即结束标志。最后三个选项不是必须的，这里加入他们只是说明有这些选项。

当然这里例子在 HTTP Tracker 中也容易实现，但是 UDP Tracker 有着更好的网络优化。

## Tracker 相关增强方案
BEP 中还有不少改进提案是针对 Tracker 的：
### Torrent 文件多 Tracker 支持
Torrent 文件中 **announce** 字段只支持定义一个 Tracker，[BEP12 - Multitracker Metadata Extension](http://www.bittorrent.org/beps/bep_0012.html) 中提出了让 Torrent 携带多个 Tracker 的方案。
在 Torrent 文件根节点增加一个键 **announce-list**，这里简易的表示为 **/announce-list**，之后在 Torrent 中增加键时也会简易地表示成这样。如果 Torrent 文件中有 **announce-list**，则会忽略 **announce**。**announce-list** 是一个列表，***列表的每个子项是都是一个子项是 Tracker URL 的列表***。之所以是一个子项为列表的列表的原因在 BEP12 中有详细的介绍与举例。此处不详细展开。

### DNS 辅助纠正 Tracker 地址
考虑到部分种子中的 Tracker 服务器可能变更服务端口或者讲 HTTP 服务改为 UDP 服务。[BEP34 - DNS Tracker Preferences](http://www.bittorrent.org/beps/bep_0034.html) 一种基于 DNS 的解决方案。
如果客户端发现自己所请求的 Tracker 没有相应，则可以查询相应域名的 DNS TXT 记录。如果有 TXT 记录是以 ”BITTORRENT“ 开头，则可以对这个 Tracker 地址进行纠正。这类 TXT 记录有以下几种类型：
 - "BITTORRENT"：表明该主机不再运行任何 Tracker 服务。
 - "BITTORRENT DENY ALL"：和前一个一致，但是表意更加明显。
 - "BITTORRENT UDP:1337 TCP:80"：表示这个主机运行两个 Tracker 服务，分别时在 UDP 端口 1337 和 TCP 端口 80 上，且优先建议使用 UDP 端口。

以下是一个相关的 TXT 记录查询过程，这个主机在多个 UDP 端口上运行了 Tracker 服务：
{% include_code dig txt lang:shell bt_dig_dns_txt.txt %}

### Tracker 返回公网 IP
[BEP24 - Tracker Returns External IP](http://www.bittorrent.org/beps/bep_0024.html) 通过在 GET 请求的返回中（UDP 也适用，下同）增加一个 **external ip** 字段来告知发起请求的 peer 自身的公网 IP。[Todo:客户端需要知道自己的公网 IP 做什么用暂时还不太清楚......ff]
通过 peer 间的 yourip 扩展消息也可以获得自身的公网 IP。

### Tracker 返回压缩 peer 列表
[BEP23 - Tracker Returns Compact Peer Lists](http://www.bittorrent.org/beps/bep_0023.html) 提出了一种压缩 GET 请求返回中 peers 字段值的方式以在一定程度上减小 Tracker 服务器的流量压力。
这种方案的返回值中 peers 字段不再是一个列表，而是一个字符串，它由代表每个 peer 的六个字节（4 个字节用于 IP 地址，2 个字节用于端口）拼接而成。去除了 peer_id 这个字段，事实证明没有这个字段也没什么关系。
Peer 通过在 GET 请求中增加 **compact** 参数来告知 Tracker 服务器自己更喜欢什么格式，0 为原始格式，1 为压缩格式。但是 Tracker 不一定会接受这个参数的建议，所以客户端仍然需要同时支持两种格式。

### IPv6 支持
[BEP7 - IPv6 Tracker Extension](http://www.bittorrent.org/beps/bep_0007.html) 提供了优化 Tracker 对 IPv6 支持的方案。
通过在 GET 请求中增加 **ipv6** 参数或者 **ipv4** 参数来告知 Tracker 服务器自己的相应 IP 版本的地址，如果在这两个字段中没有端口信息，那么将 **port** 字段作为端口。如果 Tracker compact 格式返回 peer 列表，那么它会在回复中增加 **peers6** 字段以返回使用 IPv6 的 peer，每个 peer 占用 18 字节。编码方式与 peers 字段一致。

## 参考资料