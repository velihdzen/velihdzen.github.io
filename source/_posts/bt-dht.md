---
title: BT 增强建议之 DHT
tags:
  - BT
date: 2018-11-12T21:11+08:00
---

BitTorrent 使用 DHT 网路来存储 peer 信息，以实现去 Tracker 化的种子。此时，每个 peer 都成了一个 Tracker。网络基于 Kademlia 算法实现，使用 UDP 进行传输。

本文主要对 BT 中的 DHT 网络实现与在博文 {% post_link dht-kademlia %} 中描述的 Kademlia 算法的区别进行总结。准确的说不能说是区别，而应该定义成实现细节，毕竟理论算法应用到实际时总需要因地制宜。

## 实现细节点

### key-value 对存储的内容

BT 使用 DHT 网络来实现去 Tracker 化，因此 peer 的信息就需要存储在 DHT 网络中，BT 中 peer 又是局限在某个 Torrent 文件中的。因此 key-value 对中 key 即 Torrent 文件的 infohash，正好 infohash 也是 160 比特长度的，value 为拥有该 infohash 文件的 peer 列表。

### $K$ 桶实现细节

首先 $K$ 桶中的节点有多种状态：如果一个节点在 15 分钟内回复过当前的节点的查询请求或者曾经回复过当前节点的查询请求同时在 15 分钟内有发送过查询请求给当前节点，则该节点相对于当前节点为 *Good 节点*；如果一个节点 15 分钟内未曾活动过，则成为 *Questionable 节点*；如果一个节点未相应当前节点的多次查询请求，则视为 *Bad 节点*。

当一个桶中节点数量已满（$K$ 的容量 $k$ 在 BT 中为 8）且都是 Good 节点，新的节点如果想要加入则直接被忽略。如果桶中有 Bad 节点，新的节点将会替代之。如果桶中有 Questionable 节点，则按照这些节点加入桶的时间进行 ping 请求，如果有节点不能被 ping 成功则新的节点将会取代之。

每个桶都会有一个*最近更新时间*标记来指示桶中节点的新鲜程度。如果一个桶中节点被 ping 成功了，或者有新的节点加入，或者一个节点被另一个替代了，这个时间会更新。如果一个桶最近更新时间已经过去 15 分钟，则需要进行一次桶刷新，方式和 Kademlia 中描述的一致。

### Peer DHT 支持与否告知

peer 通过在 handshake 握手消息中将 reserved_byte 的最后一比特设置为 1 来表示支持 DHT 网络。同样支持 DHT 网络的节点收到该握手消息后会发起一个 PORT 消息，type 为 9，负载为两个字节的 DHT 节点 UDP 端口。收到 PORT 消息的节点需要对改节点端口执行 ping 操作，如果对方响应了，则节点需要尝试将其加入到 $K$ 桶中。

### 初始节点获取

去 Tracker 化的 Torrent 文件中是没有存储 Tracker 地址的 ”announce“ 键的。取而代之的是 ”nodes“ 键，nodes 中需要存储距离 key 最近的 $k$ 个节点地址或者存储一个 *Good 节点*，比如说产生这个 Torrent 的用户节点。不能将某些公共的节点加入到 Torrent 文件中，否则就变得不那么去 Tracker 化了。nodes 大概可以表示为：
```
nodes = [["<host>", <port>], ["<host>", <port>], ...]
nodes = [["127.0.0.1", 6881], ["your.router.node", 4804]]
```

### RPC 消息
BT 使用 KRPC 来实现 Kademlia 节点间的 RPC 通信，KRPC 消息有三种消息类型：查询，响应，错误。对于 DHT 协议，有四种查询协议：ping，find_node，get_peers，announce_peer。

#### KRPC 协议

KRPC 协议是基于 UDP 和 bencode 编码的 RPC 协议。每条 KRPC 消息带有三个公共键值对以及其他因消息类型而异的键。三个公共的键是：
- ”t“：值为字符串，代表 transaction ID。由发起 query 请求的节点生成，被请求节点需要在回复中返回。一般两个字节；
- ”y“：值为单字符，代表消息类型，是 q(query)、r(response)、e(error) 中的一个；
- "v"：值为字符串，代表客户端版本 [BEP 20](http://www.bittorrent.org/beps/bep_0020.html) 中定义，不一定存在这个键；

每种消息会有自己额外的键：
##### Query 消息

- ”q“：值为字符串，代表具体的方法类型；
- ”a“：值为字典，代表具体方法对应的参数字典；

##### Response 消息

如果 Query 消息执行成功，则会返回该 Response 消息。

- ”r“：值为字典，代表返回值字典；

##### Error 消息

如果 Query 消息执行失败，则会返回该 Error 消息。

- ”e“：值为列表，第一个元素代表错误码，第二个元素是错误消息；

错误消息类型如下：

| Code | Description                                                  |
| ---- | ------------------------------------------------------------ |
| 201  | Generic Error                                                |
| 202  | Server Error                                                 |
| 203  | Protocol Error, such as a malformed packet, invalid arguments, or bad token |
| 204  | Method Unknown                                               |

示例错误消息：
```
generic error = {"t":"aa", "y":"e", "e":[201, "A Generic Error Ocurred"]}
bencoded = d1:eli201e23:A Generic Error Ocurrede1:t2:aa1:y1:ee
```

#### DHT Query 消息

##### ping
用于检测一个节点是否工作，相当于 Kademlia 的 PING 调用。
```
arguments:  {"id" : "<querying nodes id>"}

response: {"id" : "<queried nodes id>"}
```

##### find_node

查找距离指定节点 ID 最近的节点 ID 信息，相当于 Kademlia 的 FIND_NODE 调用。
```
arguments:  {"id" : "<querying nodes id>", "target" : "<id of target node>"}

response: {"id" : "<queried nodes id>", "nodes" : "<compact node info>"}
```
"Compact node info" 列表中每个节点信息占用 26 字节，其中节点 ID 20 字节，IP 与 Port 占用 6 字节。

##### get_peers

查找与指定 info_hash 相关的 peer 信息，相当于 Kademlia 的 FIND_VALUE 调用。

```
arguments:  {"id" : "<querying nodes id>", "info_hash" : "<20-byte infohash of target torrent>"}

response: {"id" : "<queried nodes id>", "token" :"<opaque write token>", "values" : ["<peer 1 info string>", "<peer 2 info string>"]}

or: {"id" : "<queried nodes id>", "token" :"<opaque write token>", "nodes" : "<compact node info>"}
```

如果被请求节点有指定 info_hash 相关 peers 则以 values 为键的 "Compact IP-address/port info" 列表，否则，返回以 nodes 为键的 "Compact node info" 列表。响应中的 token 需要请求者在通过 announce_peer 向回复者宣告 peer 信息时携带。

##### announce_peer

宣告节点自身拥有特定 info_hash 的数据，并在某个端口进行下载，相当于 Kademlia 的 STORE 调用。

```
arguments:  {"id" : "<querying nodes id>",
  "implied_port": <0 or 1>,
  "info_hash" : "<20-byte infohash of target torrent>",
  "port" : <port number>,
  "token" : "<opaque token>"}

response: {"id" : "<queried nodes id>"}
```

接受者需要校验 token 是否与之前它通过 get_peers 调用的响应回复给该请求者的一致。如果 implied_port 值为 1，表示 port 的值不可用，接受者需要将请求包的 UDP 源端口作为 port。

## BT DHT 相关增强方案

### DHT Scrape 帮助选择 Seeding 内容

类似 [Tracker Scrape](http://bittorrent.org/beps/bep_0048.html)，DHT 网络可以通过 [BEP33 - DHT Scrapes](http://bittorrent.org/beps/bep_0033.html) 中定义的 DHT scrape 来了解某个 Swarm 中 peer 的大致情况，然后根据这个状态选择 seeding 队列中下一个 Swarm 进行做种。这种算法主要通过布隆过滤器（Bloom Filter）实现，布隆过滤器通常用于检索一个元素是否在一个集合中。但在 DHT scrape 中，作用所有不同。加入布隆过滤器中的是各个 peer 的 IP 的 sha1 值，可以根据过滤器中剩余的 0 比特数量来估算整个 Swarm 的规模。

### 只读 DHT 节点

在一些情况下，DHT 节点主动或被动地限制成为只读节点（[BEP43 - Read-only DHT Nodes](http://bittorrent.org/beps/bep_0043.html) 中定义），比如位于 NAT 后且 hole punching 失败的节点，节点具有流量限制或者有流量计划，流量会影响节点的电量等等情况。

节点通过在每条向外发送的 DHT Query 消息中给出一个 `ro=1` 的键值对来表明自己为只读节点。成为只读节点后，不再响应其他节点的 Query 请求。其他节点知晓只读节点后也不会发送 Query 请求以减少网络流量。

### 在 DHT 中存储任意数据

[BEP44 - Storing arbitrary data in the DHT](http://bittorrent.org/beps/bep_0044.html) 中提供了一种在 DHT 中存储任意数据的方式。存储的数据可以是不可变数据也可以是可变数据，不可变数据的 key 是数据内容的 sha1 值，可变数据的 key 是用于签名数据的密钥对公钥。[BEP46 - Updating Torrents Via DHT Mutable Items](http://bittorrent.org/beps/bep_0046.html) 则基于在 DHT 网络中存储可变数据而给出了一种用于更新 Torrent 的方法。[BEP50 - Publish/Subscribe Protocol](http://bittorrent.org/beps/bep_0050.html) 实现了一种基于主题的发布订阅模式来向订阅特定主题的客户端发送更新后可变数据的协议。

### 多个监听地址情况处理

某些客户端可能会监听多个公网单播 IP 地址，如果在这种情况下，该客户端仅使用一个节点 ID，则其他节点可能会因为多地址现象而对该节点 ID 进行清理。[BEP45 - Multiple-address operation for the BitTorrent DHT](http://bittorrent.org/beps/bep_0045.html) 中给出了一些要求和建议：

- 要求每个套接字地址必须具有不同的节点 ID，且它们的 XOR 距离要分得比较开，响应必须从收到相应请求的同一套接字地址发送；
- 建议节点应避免在单个IP地址上使用多个端口；

### 其他

和 DHT 相关的草案还有如对 IPv6 的支持（[BEP32 - BitTorrent DHT Extensions for IPv6](http://bittorrent.org/beps/bep_0032.html)），DHT 网络安全（[BEP42 - DHT Security extension](http://bittorrent.org/beps/bep_0042.html)），检索其他节点存储的 infohash 列表（[BEP51 - DHT Infohash Indexing](http://bittorrent.org/beps/bep_0051.html)）等。

## 参考资料

1. [μTorrent: What's the difference between the status "Queued Seed" and "Seeding"?](https://www.quora.com/%CE%BCTorrent-Whats-the-difference-between-the-status-Queued-Seed-and-Seeding)