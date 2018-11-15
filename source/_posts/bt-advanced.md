---
title: BT 增强建议之进阶改进方案
tags:
  - BT
date: 2018-11-15 19:45:00
categories:
---

本文是 BT 系列文章中的一篇，主要介绍 BEP 中剩下的改进方案，有需要的话可以先阅读博文 {% post_link bt-overview %}。

## 进阶改进方案

本节点详细介绍几个比较重要的进阶改进方案。剩余的只作简单归纳。

### 超级做种模式提高做种效率

[BEP16 - Superseeding](http://bittorrent.org/beps/bep_0016.html) 中起草的超级做种功能是一个来帮助初始做种者使用较少的流量来完成做种的算法。当一个做种客户端进入超级做种模式后，它将不会表现为一个标准的做种者，而是伪装成一个没有数据的正常 peer。当有其他 peer 连接时，它仅将一个从未发送过的片段发送给刚连接的 peer，在一个别的 peer 通知到该做种者这个片段前，做种者不会向刚才的 peer 发送新的片段，以此节约做种者的流量。
一般情况下，不建议使用超级种子模式。虽然它确实有助于更广泛地分发稀有数据，因为它限制了客户端可以下载的片段的选择，但也限制了这些客户端下载已经检索到的部分片段数据的能力。因此，超级种子模式仅推荐用于初始种子服务器。

### 使用 Web 方式做种

WebSeed 在 BEP 中有两个增强建议：[BEP19 - HTTP/FTP Seeding (GetRight style)](http://bittorrent.org/beps/bep_0019.html) 和 [BEP17 - Seeding (Hoffman-style)](http://bittorrent.org/beps/bep_0017.html)

BEP17 提供了一种通过 HTTP 协议做种以及从 HTTP 获取数据的方式。初始做种者主要在元数据文件中加入键 `httpseeds`，值为支持 HTTP Seeding 服务器地址列表，举例如下：

```
d['httpseeds'] = [ 'http://www.site1.com/source1.php',
                   'http://www.site2.com/source2.php'  ]
```

客户端通过以下方式访问 HTTP Seeding 服务器获取全部或者特定数据片段。

```
<url>?info_hash=[hash]&piece=[piece]{&ranges=[start]-[end]{,[start]-[end]}...}
```

BEP19 通告服务器地址的方式和 BEP17 差不多，但是键改为了 `url-list`。BEP19 的优点是能够处理任何可通过普通 HTTP 或 FTP 访问的文件，利用标准 HTTP 请求下载片段。BEP17 要求对服务器做适当修改，以支持 BEP17，这在互操作性方面是一个缺点，但它确实具有允许种子服务器更好地控制流量和避免带宽滥用的优势。

### 私有种子加强数据分享隐私性

私有种子是在 [BEP27 - Private Torrents](http://bittorrent.org/beps/bep_0027.html) 中描述的，通过在元数据信息总增加键值对 `private=1` 来标记种子为私有种子。客户端只能向私有种子对应的私有 Tracker 通告自身，而且只能与私有 Tracker 返回的 peer 建立连接。

当私有种子的 `announce-list` 中出现多个 Tracker 地址时，每个 peer 在一个时刻只能使用其中一个 Tracker，只有当 Tracker 出错时才可以切换 Tracker。在切换 Tracker 时，peer 必须断开所有与其他 peer 的连接，之后只能与新的 Tracker 提供的 peer 建立连接。这减轻了攻击者通过修改元数据文件中 `announce-list` 后发布新的元数据文件进行攻击带来的影响。

当种子为私有种子时，通过其他方式（包括 DHT, PEX, LSD 等）获取 peer 都会对“私有”进行破坏。但是不能避免攻击者通过猜测 peer 的 IP 与端口的方式找到 peer，进而产生连接。

### Merkle Tree 数据结构优化元数据文件大小

如果种子文件过大，对于提供种子文件下载的中心化服务器就会有较大压力。为了让元数据文件体积减小，一个有效的方法就是将每个片段的大小增加（上限是 2 Mb），同样大小的文件因此会产生更少的摘要数量。考虑到只有当一个片段被完全接受完成且验证摘要后，才能将之与其他 peer 进行交换，这意味着节点需要一段时间才能和其他 peer 进行交换。

[BEP30 - Merkle hash torrent extension](http://bittorrent.org/beps/bep_0030.html) 利用了 Merkle Tree 这种数据结构来优化元数据文件大小。该方案使用单一的 Merkle 哈希来替代摘要列表。Merkle 散列可用于通过分层方案验证整个内容文件以及各个块的完整性。它通过构建与数据相关的哈希树并仅需使用根哈希作为验证数据完整性的依据。

如图所示，P0-P12 代表片段 0-12，X 是为了树的完整而填充的零值片段，0-30 均表示哈希，其中 0 是根哈希。如果一个节点接受到了完整的片段 P8，那么该节点只需要额外通过一些途径知道 P8 的姊妹片段 P9 的哈希值，以及 P8 的所有叔块哈希（依次为 12，6，1）就可以验证 P8 的完整性。

```
                                          0* = root hash
                                       /     \
                                   /            \
                               /                   \
                           /                          \
                       /                                 \
                     1*                                     2
                    / \                                    / \
                  /     \                                /     \
                /         \                            /         \
              /             \                        /             \
            /                 \                    /                 \
           3                   4                  5                   6* = uncle
          / \                 / \                / \                 / \
         /   \               /   \              /   \               /   \
        /     \             /     \            /     \             /     \
      7         8         9        10        11        12*       13        14 
     / \       / \       / \       / \       / \       / \       / \       / \
   15   16   17   18   19   20   21   22   23   24   25   26   27   28   29   30
   
   P0   P1   P2   P3   P4   P5   P6   P7   P8*  P9*  P10  P11  P12   X    X    X
   = piece index                            =    =                   = filler hash 
                                            p    s                   
                                            i    i                   
                                            e    b                   
                                            c    l
                                            e    i
                                                 n
                                                 g
```

原始资源发布者需要将元数据中的原本用来存储片段散列值的 **pieces** 键替换为存储根哈希的键 **root hash**。

支持 Merkle Tree 哈希方式的客户端需要同时支持扩展消息（见 {% post_link bt-peer %}）来替代普通的 **piece** 消息来完成数据传输。用于传输数据的扩展消息类型是 **Tr_hashpiece** ，和其他扩展消息一样，这个消息也需要在 peer 间的扩展握手消息中声明。

**Tr_hashpiece** 消息的负载内容如下：

- index：4 个字节，代表数据片段序号；
- begin：4 个字节，代表当前当前数据子片段在整个片段中的偏移量；
- hashlist length：4 个字节，代表哈希列表的长度
- hashlist：哈希列表，包括片段自身哈希，姊妹片段哈希，以及各个叔片段哈希，最后是根哈希，只有当 begin 为 0 时，才需要传输 hashlist；
- subpiece data：数据子片段；

在 peer 接收完成某个数据片段的 **Tr_hashpiece** 消息后，它将根据 hashlist 中的哈希列表计算出的根哈希与原有的根哈希进行比对。如果匹配，所有哈希值都保存在该 peer 自己的 Merkle Tree 中，之后它们可以被传递给其他人。

需要注意的是，使用 Merkle Tree 的 Torrent 与使用散列值列表的 Torrent 即使它们的数据完全相同，但是由于 infohash 不一致，导致它们不在同一个 Swarm 中。另外一旦采用了 Merkle Tree 的方式，通过 WebSeed 来获取数据就变得不兼容。

## 其他方案简述

- [BEP35 - Torrent Signing](http://www.bittorrent.org/beps/bep_0035.html)　利用对种子进行签名以增加下载安全性。
- [BEP36 - Torrent RSS feeds](http://bittorrent.org/beps/bep_0036.html) 定义了 RSS 订阅种子的 feed 格式。
- [BEP38 - Finding Local Data Via Torrent File Hints](http://bittorrent.org/beps/bep_0038.html) 则提出了粗略地检测用户本地是否已经存在全部或者部分即将下载的文件的方案。主要涉及在种子文件中添加 `similar` 或 `collections` 这两个键。前者表示可能与某个 infohash 共享部分数据，后者表示该种子文件所属的集合，属于同一集合的种子可能共享文件。
- [BEP39 - Updating Torrents Via Feed URL](http://bittorrent.org/beps/bep_0039.html) 使用在 info 中的键 `update-url` 来表明用于更新该种子的链接地址，如果客户端请求该地址成功且得到一个种子文件，则需要下载该更新后的种子。
- [BEP47 - Padding files and extended file attributes](http://bittorrent.org/beps/bep_0047.html) 在原始元数据描述文件信息的基础上增加了一些额外的属性。例如符号链接重复文件；为文件添加 padding 以使得下一个文件数据从片段边缘开始。
- [BEP49 - Distributed Torrent Feeds](http://bittorrent.org/beps/bep_0049.html) 与 BEP36 提供的 RSS 订阅功能类似，但是通过 DHT 网络实现。

## 参考资料

1. [Implement Web (HTTP) Seeding (BEP17+BEP19) · Issue #67 · webtorrent/webtorrent](https://github.com/webtorrent/webtorrent/issues/67)
