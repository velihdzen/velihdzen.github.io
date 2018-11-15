---
title: BT 增强建议之 Peer
tags:
  - BT
date: 2018-08-30 19:14:00
categories:
---

本文是 BT 系列文章中的一篇，主要介绍 Peer 以及 Peer 间的通信，有需要的话可以先阅读博文 {% post_link bt-overview %}。

## Peer 来源
在讲 Peer 间的通信前，先总结一下 Peer 的来源。
1. **Magnet**：磁力连接中有 **x.pe** 参数可以预设一些 Peer；
2. **Tracker**：Tracker 服务器的作用就是提供 Peer；
4. **Local Service Discovery**（[BEP14](http://bittorrent.org/beps/bep_0014.html)）:通过对本地组播地址 `239.192.152.143:6771` 和 `[ff15::efc0:988f]:6771` 发出 info_hash 宣告来尝试获得响应，如果有响应，则添加为 Peer；
5. **Peer Exchange**：通过 Peer 间的 **Peer Exchange** 扩展消息来与其他 Peer 交换 Peer，后面会详细提到；
3. **DHT**：通过 DHT 网络获取；

## 协议概述
Peer 间的通信属于应用层协议，它使用的应用层协议可以是 TCP 或者 µTP。

Peer 间按照元数据中描述的文件片段索引（起始索引为 0）进行数据交换，当一个 peer 下载完成一个分片而且经过了通过了 hash 值的校验，它会通知它的所有 peer 自己拥有了这个片段。

Peer 连接的 Peer 会有一定上限数量，所有的 Peer 按照 [BEP40 - Canonical Peer Priority](http://bittorrent.org/beps/bep_0040.html) 中定义的基于双方 IP 的 crc32-c 值的算法进行排序，选择这个值更小的若干 Peer 进行连接。

每个连接会包含两个状态位，choked or not（表示是否对对方 choked），interested or not（表示是否对对方的数据感兴趣），状态在连接建立时的初始值为 choked 以及 not interested。因为交互是双方的，一方不仅要存储自己给对方设定的状态，也要存储对方给自己设定的状态，因此实际上会有四个状态位（BEP 中表示只有两个状态位，但是由于主动与被动语态的复杂性以及考虑到实际源码的实现，这里引入成四个状态位，增加了一定的冗余，但便于写作，一定程度上也便于理解）。

假设 A，B 是在下载同一个资源的对等体。用 A.B 表示 peer A 中 A 与 B 的连接。所以 A 与 B 连接建立时，在 A 的内存空间中的保存的对于 B 的连接会有如下的状态：
``` c
choked = true;
interested = false;
peer_choked = true;
peer_interested = false;
```
同样道理，B 中也会有类似的这样四个状态。且初始状态相同。只有当 A 的 `interested == true` 而且 `peer_choked == false` 时，A 才能向 B 索要数据。

对于 A 而言，有下面四个时机更新这一组状态：
 - 在收到 B 发来的 **choke**/**unchoke** 消息时，会更新 `peer_choked` 状态置为 true/false；
 - 在收到 B 发来的 **interested**，**not interested** 消息时，会更新 `peer_interested` 状态置为 true/false；
 - 不断根据自己所拥有的分片与 B 拥有分片的状态（B 通过 **bitfield** 消息告知 A）更新 `interested` 状态，并通过发送 **interested**/**not interested** 消息给 B；

## 消息类型
**handshake** 是连接 peer 间连接建立后发送的第一个消息，主要用于通告 info_hash 与 peer_id：
```
| 19 (1) | "BitTorrent protocol" (19) | reserved_byte (8) | info_hash (20) | peer_id (20) |
```
**keepalive**，第一个字段为消息体长度，keepalive 消息长度体为 0：
```
| len (4) |
```

除基础消息外的其他消息均有固定的格式如下：消息体长度 + 类型 + 负载。
```
| len (4) | type (1) | payload |
```
可能的类型值有：
 - 0 - choke
 - 1 - unchoke
 - 2 - interested
 - 3 - not interested
 - 4 - have
 - 5 - bitfield
 - 6 - request
 - 7 - piece
 - 8 - cancel
 - 20 - extend message

其中 **choke**，**unchoke**，**interested**，**not interested** 消息没有负载。

**bitfield** 消息仅在 handshake 后双方各发送一次，每个比特表示对应的分片是否完整。
```
| len (4) | 5 (1) | bitfield |
```

**have** 消息的负载是一个整型数字，peer 在一个分片下载完成并校验通过后发送该附带刚下载完成分片的索引的消息给其他 peer。
```
| len (4) | 4 (1) | index (4) |
```

**request** 消息结构如下，用于请求指定分片（index）的范围为 `[ offset, offset + length )` 的字节，length 一般为 2^14 (16 kiB)，超过则会关闭连接。
```
| len (4) | 6 (1) | index (4) | offset (4) | length (4) |
```

**piece** 消息用于回复 request 消息，即返回自身分片（index）的范围为 `[ offset, offset + length )` 的字节
```
| len (4) | 7 (1) | index (4) | offset (4) | block (length) |
```

**cancel** 消息除了类型和 request 消息不同外，其他均与 request 一致，用于向 peer 取消之前发出的 request 请求。这是由于为了加快最后若干分片的下载速度，客户端会启用 **Endgame** 模式，这个模式下，peer 会向所有的 peer 请求相同的分片片段，当 peer 从某个 peer 获得所需的分片片段后，需要向剩余的 peer 发送 cancel 消息以减少不必要的传输。
```
| len (4) | 8 (1) | index (4) | offset (4) | length (4) |
```

类型为 20 的是扩展消息。

## 扩展消息
[BEP10 - Extension Protocol](http://bittorrent.org/beps/bep_0010.html) 中定义了扩展消息。peer 通过将 handshake 消息的保留字节的右数第 20 个比特置为 1 来通告其他 peer 自身支持扩展消息。即可以通过判断表达式 `reserved_byte[5] & 0x10` 来判断 peer 是否支持扩展消息。

扩展消息的基础结构如下，实际上相当于是类型为 20 的普通消息。

```
| len (4) | 20 (1) | extended_messag_id (1) | payload |
```

extended_messag_id 为 0 的消息是 **Extend Handshake** 消息。

### Extend Handshake

Extend Handshake 消息的有效载荷是一个 bencode 字典。字典中的所有键都是可选的，peer 需要忽略所有自己不支持的键。可选的键（还可以有更多）如下:

- **m**：字典，表示支持的扩展消息，键是扩展消息名称，值是扩展消息的 id（与 extended_messag_id 对应）。peer 通过这个键通告其他 peer 自己支持的消息类型，且该 peer 之后发送其他的扩展消息就会使用在这里对应的 extended_messag_id。扩展消息名称的格式一般为 `客户端缩写_消息名称`，这样可以实现全网全局消息类型唯一（侧重实现）；而 extended_messag_id 则是自己客户端自己定义，在 m 字典中不重复即可（侧重索引），这样便可以做到单向通信唯一。
- **p**：整型，表示本地监听端口。帮助另一方了解自己的端口信息。连接的接收方是不需要发送这个扩展消息的，因为接收方的端口是已知的。（实际上 peer 间通信无论是基于 TCP 还是 µTP（UDP），接收方理论上都可以从传输层获得端口数据）。
- **v**：字符串，表示客户端的名称与版本，这个比 peer id 更可靠一些。
- **yourip**：字符串，表示在 peer 视角中对方 peer 的 IP，一般客户端通过此获取自己的公网 IP。
- **ipv6**：字符串，表示自身压缩格式的 IPv6 地址。可能对方 peer 更喜欢使用 IPv6 地址。 
- **ipv4**：字符串，表示自身压缩格式的 IPv4 地址。可能对方 peer 更喜欢使用 IPv4 地址。
- **reqq**：整型，表示自身的在不丢弃消息情况下可以保留的未处理的消息数量。在 libtorrent 中这个值是 250。

这个消息需要在普通 handshake 成功后立即发送，在连接的生命周期内这个 Extend Handshake 多次发送都是有效的，但实际实现中有可能被忽略。如果后续的 Extend Handshake 消息指定 m 字典中某些扩展的扩展 id 为 0，则表示禁用这些扩展。

### Metadata Request(ut_metadata)

[BEP9 - Extension for Peers to Send Metadata Files](http://bittorrent.org/beps/bep_0009.html) 中定义了磁力链接，同时也定义了用于从 Peer 获取元数据的扩展消息 **UT Metadata**。

如果一个 peer 的客户端支持 **UT Metadata** 消息，那么在该 peer 向其他 peer 发送 Extend Handshake 消息时，需要在字典 m 中加入 **ut_metadata** 这个键，同时保持其对应的消息 id 在 m 字典中唯一。特殊的是对于这个消息的支持还需要在 Extend Handshake 消息负载字典中加入一个键 **metadata_size**，表示元数据的字节数。

**UT Metadata** 消息的负载也是一个 bencode 字典，有如下的键：

- **msg_type**：整型，代表消息类型，可能的类型有：
    - **request**：0。请求类型，即请求序号为 **piece** 的 metadata 片段。请求类型的返回类型为 **data** 或者 **reject**；
    - **data**：1。正常返回序号为 **piece** 的 metadata 片段。元数据会按照 16 kiB 大小切分，除了最后一片段，其余的都应该为 16 kiB 大小，序号也由此分割大小得来。元数据片段作为负载的一部分跟在整个字典后面，其并不使用 bencode 编码，但是长度需要计算在 **len** 中。
    - **reject**：2。表示被请求的 peer 没有序号为 **piece** 的 metadata 片段。也有可能是一定时间内请求超过数量限制，为了防止洪泛攻击，直接表示拒绝。
- **piece**：指定元数据的分片序号。
- **total_size**：仅在 **data** 类型消息中出现，和握手消息中的 **metadata_size** 语义一致。

### Partial Seeds
这个扩展是为了让 BT 支持对 Partial Seeds（部分种子，[BEP21 - Extension for partial seeds](http://bittorrent.org/beps/bep_0021.html)）的识别与进一步优化。部分种子就是资源不完整但是也不再进行下载的 peer。这种情况发生在多文件种子中，用户只设定下载一部分文件。

这个扩展不定义额外的扩展消息，但是在扩展握手消息的字典中加入一个键 **upload_only**，值为整型，如果 peer 对下载不感兴趣则需要讲此值置为 1。

在 Tracker 的 Scrape 请求回复中，定义了 **complete**, **incomplete** 以及 **downloaded** 三种状态的 peer。为了让其他 peer 可以通过 Tracker 知晓 Partial Seeds 的情况，扩展定义了在 Scrape 回复中加入类型 **downloaders**，表示处于活跃状态，未完成下载且仍然需要继续下载的 peer 数量，Partial Seed 的数量可以通过 `incomplete - downloaders` 得到。同时让 Tracker 知晓 peer 自身处于 Partial Seed 状态，则需要通过 `event=paused` 事件进行告知，且每次通告时都要发送该事件。

### Peer Exchange(ut_pex)

Peer Exchange(PEX) 用于在 peer 间交换 peer 列表。通过在 Extend Handshake 消息的 字典 m 中加入 **ut_pex** 这个消息名称来表明支持，同样道理，消息 id 在 m 字典中保持唯一即可。

PEX 消息的负载也是一个 bencode 字典，有如下的键：

- **added**：当前连接的 IPv4 peer 压缩格式列表，告知对方进行添加
- **added.f**：当前连接的 IPv4 peer 标志位，每个 peer 一个字节
- **added6**：当前连接的 IPv6 peer 压缩格式列表，告知对方进行添加
- **added6.f**：当前连接的 IPv6 peer 压缩格式列表标志位
- **dropped**：过去断开连接的 IPv4 peer 压缩格式列表，告知对方进行删除
- **dropped6**：过去断开连接的 IPv6 peer 压缩格式列表，告知对方进行删除

标志位定义如下：

- 0x02：属于 seed 或者 partial seed
- 0x04：支持 uTP
- 0x01：prefers encryption, as indicated by e field in extension handshake
- 0x08：peer indicated ut_holepunch support in extension handshake
- 0x10：outgoing connection, peer is reachable

#### 发送规则

- 如果 peer 与某些 peer 断开连接，则需要需要在适当时候发送 PEX 消息，将断开连接的 peer 放在 dropped 中；
- 每分钟发送的 PEX 消息不能超过一条；
- 不需要在握手后立即发送 PEX 消息，在收集满一定的 peer 之后再发送效果更好；
- 添加或删除的 peer 列表中不能包括重复项，也不能在同一个 PEX 消息中删除添加的 peer；
- 除了最初的 PEX 消息之外，每条消息中添加的 peer 数量或者 删除的 peer 数量均不能超过 50 条；
- added, added6, dropped, dropped6 四个键中至少需要有一个；
- peer 可能会与严重违反这些规则的 peer 断开连接；

#### 扩充 seed
每个 peer 会执行如下的执行一些规则来断开与部分 peer 的连接。比如
1. 在作种的时候会断开与 seed 和 partial seed 的连接；
2. 根据 peer id 断开 IPv4 以及 IPv6 地址实际上属于同一个 peer 的一个连接，保留自己偏爱的地址家族连接；

这样的策略下，在 seed 占主导地位的 swarm 中通过 PEX 传播的活跃 peer 会不足。类似地，在 IPv4 占主导的 swarm 中，只支持 IPv6 的 peer 将很难获得 IPv6 的 peer。这很大程度降低了 PEX 消息的有效性。

为了解决这些问题，如果一个 peer 连接到一个特定地址家族的 peer 少于25个，活跃度的要求就会放宽。因为一下原因导致连接断开的 peer 也会被保存下来，并有资格被发在 PEX 消息的 added 中：
1. 因为 peer id 相同而被断开的另一个地址家族的连接；
2. 因缺乏兴趣而断开连接的 peer，比如对方是 seed/partial seed 或者对方拥有的分片不满足自己的需求；
3. 因为超过本地资源限制而断开的连接，比如全局的连接上限；

为了保证 peer 的有效性，因为这些原因添加到 added 中的 peer 只能通过 PEX 消息发送一次，发送完后必须从等待发送列表中删除。

#### 安全性
通过 PEX 获得的 peer 应该视为不可信的。攻击者可能通多伪造 PEX 消息来攻击这个 swarm。攻击者也可能通过 PEX 消息诱导 BT 客户端对特定 IP 进行尝试连接而引发 DDoS 攻击。

为了缓解这些问题，peer 应该避免从单个 PEX 源获取其所有连接作为候选连接。应忽略具有不同的端口的重复 IP，还可以根据 peer 的优先级来进行（协议概述中提到）排序。

## 快速扩展（Fast Extension）

另外还有类似扩展消息的快速扩展消息，通过将握手消息的 `reserved_byte[7] |= 0x04` 来通告支持快速扩展，这里只列出快速扩展消息的种类，具体协议格式可参见 [BEP06 - Fast Extension](http://bittorrent.org/beps/bep_0006.html)。

- **Have All/Have None**：来表示拥有所有分片或者未拥有任何分片，是 **bitfield** 消息的快速版本；
- **Suggest Piece**：建议其他 peer 下载某分片；
- **Reject Request**：拒绝 peer 对某个片段的请求；
- **Allowed Fast**：表示如果 peer 请求这个分片，即使它处于 choked 状态也会给它；
- **lt Dont Have**：在某些情况下（比如资源短缺，LRU Cache 过期）会导致 peer 不再拥有某个片段，则可以通过此消息告知其他 peer，该扩展定义在 [BEP54 - The lt_donthave extension](http://bittorrent.org/beps/bep_0054.html) 中；


## 分片选择策略
选择一个好的分片下载顺序与否对下载性能有这很大影响。如果选择了一个差的分片下载选择算法，则某一时刻可能所有分片你都可以下载，但是之后就没有你想下载的分片了。BT 中执行一下策略：

### Strict Priority（严格模式）
一旦请求了某个分片的子片段，那么就会在请求其他子片段之前请求该特定分片的剩余子片段，以尽量优先获得这个完整的分片。

### Rarest First（稀有优先）
在选择接下来下载哪个分片时，peer 会选择最稀有的分片（自己没有这个分片，同时其他 peer 有，但是有这个分片的 peer 数量相对其他分片最少）进行下载。这个算法保证了不稀有的分片在之后仍然能被下载到，同时稀有的分片在逐渐变多。通过尽快复制最稀有的分片，减小了稀有分片在当前连接的 peer 中完全消失的可能性。

### Random First Piece（随机首分片）
当下载开始时，不会使用稀有优先算法。开始时 peer 没有分片可以用于上传，所以最重要的是尽快得到一个完整的分片。稀有的分片往往只被某一个 peer 拥有，从这个 peer 处下载这个分片（分成多个子片段）将会慢于从多个 peer 处下载相同分片的不同子片段。出于这个原因，刚开始下载时，会随机选择一个分片进行下载，随后策略转为稀有优先。

### Endgame Mode
有时从一个 peer 请求某个分片会很慢，这在下载整个资源你的中途不会是一个问题（因为中途同时发生不少请求），但是这种情况可能会影响最终的即将下载完成阶段。当所有剩余的子片段都已经在向其他 peer 请求时，它会同时向所有的 peer 请求这些子片段。当某一个 peer 返回了一个子片段，就向剩余的 peer 发送 cancel 消息以节约带宽。在实践过程中，Endgame 模式持续时间非常短，所以浪费的带宽不多，而且使得资源的最后一部分下载非常快。

## Choking 算法
BT 没有中心化的资源分配，每个 peer 有责任去最大化自己的下载速率。Peer 执行一种变种 tit-fot-tat 策略，从与自己相连的 peer 处下载分片，并选择合适的 peer 进行上传，对其他 peer 进行 choke。choke 表现为拒绝上传，但下载仍可继续，同时连接被保持不销毁，在 choke 结束后连接不需要重建。Choking 算法对于 BT 来说不是必须的，但是如果需要有一个好的下载性能是非常重要的。一个好的 choking 算法需要利用好所有的资源，提供好的上传给其他 peer，同时惩罚那些只下载不上传的 peer。

BT 中使用的变种 tit-fot-tat 策略是囚徒困境的应用，博主 youxu 的文章 [P2P客户端的策略和奇妙的对策论](https://blog.youxu.info/2008/12/31/tit-for-tac-and-p2p-software/) 对这此有着很通俗易懂的解释。

对于某个 peer 的 Choking 算法 可以描述如下： 
1. **Choking Algorithm**：每 T 时间选择合适的 k 个 peer 进行 unchoke，选择的标准为过去 S 时间 peer 的下载速率；
2. **Optimistic Unchoking**：每 nT 时间，随机选择一个 peer 进行 unchoke，以尝试发现更优质的 peer；
3. **Anti-snubbing**：如果 mT 时间内没有从某个 peer 处获取到一个分片，则认为被 **snubbed** 了，对其进行 choke；
4. **Upload Only**：当一个 peer 下载完成了，即成为了一个 seed，则只进行上传，不再下载。peer 会选择那些该 peer 对其有较高上传速率的 peer 进行上传。

实际实现中 T = 10s, k = 7, S = 20s, n = 3, m = 6。


## 参考资料
1. [Question About Canonical Peer Priority](https://forum.utorrent.com/topic/90069-question-about-canonical-peer-priority/)