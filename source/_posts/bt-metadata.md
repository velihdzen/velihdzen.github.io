---
title: BT 系列之 Metadata：Torrent 与 Magnet
tags:
  - BT
date: 2018-08-26 22:00:00
categories:
---

本文是 BT 系列文章中的一篇，主要介绍 Tracker 服务器的工作原理，有需要的话可以先阅读博文{% post_link bt-overview %}。

在磁力链接出现前，BT 下载的第一步就是获取 Torrent（种子）文件。种子文件中包含了资源的最关键信息 —— Metadata（元数据）。Magnet（磁力链接）的引入则省去了获取种子文件这一步，但是仍然需要元数据，只是改为从 peer 处获取。有了元数据后，才能知道整个资源的概况，继而进行下载。

## Torrent
### 文件结构
种子文件使用 bencode 进行编码，整个文件是一个字典。有下列主要的 key（value 中，整型值的单位均为字节，字符串默认使用 UTF-8 编码）：
 - **announce**：字符串。tracker 的 URL 地址，仅能定义一个 Tracker。
 - **info**：字典。也就是资源的元数据：
     - **length**：整型。如果有该字段，则代表种子为单文件种子，代表该文件的大小。
     - **files**：列表，子项类型为字典。如果有该字段，则代表种子为多文件种子。一个种子只能为单文件种子或者多文件种子，因此 **files 字段和上述 length 字段只能选其中之一**。files 字典的字段包括：
         - **length**：整型。代表该文件的大小。
         - **path**：列表，子项类型为字符串。子目录名称列表，最后一项为文件名，因此该列表长度至少需要为 1。
     - **name**：字符串。如果是单个文件的种子，那么这个字段表示该文件的文件名，否则表示多个文件存储的根目录。
     - **piece length**：整型。为了方便传输与节点间交换数据，文件被分片，这个字段代表每个片段的大小，除了最后一片可能会被截断，这个值一般为 2 的幂次。
     - **pieces**：被编码成字符串，但是需要被解析成 SHA1 值。代表所有片段的 SHA1 值（每个值占用 160 比特）。

### 举例
#### 单文件种子
这是一个单文件种子文件的 JSON 化结构示意，文件 debian-503-amd64-CD-1.iso 被分成大小为 256 KiB 的 $\left(\lceil\frac{length}{piece length}\rceil = 2588\right)$ 片。
``` json
 {
     "announce": "http://bttracker.debian.org:6969/announce",
     "info":
     {
         "name": "debian-503-amd64-CD-1.iso",
         "piece length": 262144,
         "length": 678301696,
         "pieces": <binary SHA1 hashes>
     }
 }
```

#### 多文件种子
这个一个包含两个文件的种子的示例。相对于单文件种子，它使用了 files 字段取代了 length 字段。
``` json
 {
     "announce": "http://tracker.site1.com/announce",
     "info":
     {
         "name": "directoryName",
         "piece length": 262144,
         "files":
         [
             {"path": ["111.txt"], "length": 111},
             {"path": ["222.txt"], "length": 222}
         ],
         "pieces": <binary SHA1 hashes>
     }
 }
```

## Magnet
### MAGNET-URI Project
提到 Magnet（磁力链接）大家都会想到 BT，但是磁力链接不是因为 BT 而诞生的，也不止用于 BT，事实上磁力链接的来自 [MAGNET-URI Project](http://magnet-uri.sourceforge.net/) 这个项目：
{% blockquote Gordon Mohr http://magnet-uri.sourceforge.net/magnet-draft-overview.txt %}
MAGNET is a work-in-progress URI specification, and collection of standard practices/implementing code to allow a website to seamlessly integrate with features made available by local utility programs. In one way, it could be thought of as a vendor- and project-neutral generalization of the "freenet:" and "ed2k:" URI-schemes used by the Freenet and EDonkey2000 peer-to-peer networks, respectively.
{% endblockquote %}

磁力链接是一个统一的规范，它希望这种 p2p 的链接都可以以按照这个规范展示，这样的话当用户在网页上点击磁力链接的时候，就可以磁力链接的参数（`xt`，下文会提及）“召唤”合适的客户端。它先被 eDonkey（电驴）推动，电驴链接理论上可以被转换成磁力链接。转换过程大致如下：
```
ed2k://|file|<name>|<file-size>|<ed2k-hash>|/
magnet:?xt=urn:ed2k:<ed2k-hash>&xl=<file-size>&dn=<name>
```
然而，这个 MAGNET-URI Project 后来应该没有被推动下去，导致甚至连电驴自己的客户端都没有支持 ed2k 的 magnet 格式。直到后来在 BT 中大放异彩，导致现在狭义上的磁力链接就是指 BT 中使用的磁力链接。

### BT 中的磁力链接
BT 中的磁力链接大概有这两种格式：
```
v1: magnet:?xt=urn:btih:<info-hash>&dn=<name>&tr=<tracker-url>&x.pe=<peer-address>
v2: magnet:?xt=urn:btmh:<tagged-info-hash>&dn=<name>&tr=<tracker-url>&x.pe=<peer-address>
```
根据 [URL 的定义](https://zh.wikipedia.org/wiki/统一资源定位符)，`magnet` 前缀表示这个链接是磁力链接，`？` 后表示为 GET 模式查询参数列表，参数使用 `&` 符号隔开。BT 磁力链接的参数如下:
 - **xt**：表示包含文件散列函数值的 URN，这是唯一一个必选参数，可能的 URN 类型有：
    - **btih**：表示 Torrent 文件 info 部分的 SHA1 值，可以是 Hex 编码或者 Base32 编码形式。
    - **btmh**：表示 Torrent 文件 info 部分的 HEX 编码 [multihash](https://github.com/multiformats/multihash) 值，multihash 是由创造 IPFS  的 Protocal Lab 的项目，用于编码多种 hash 函数的 hash 结果。**btmh 可以和 btih 同时存在，这个应该和 [SHA1 被破解](https://security.googleblog.com/2017/02/announcing-first-sha1-collision.html)相关——有 btmh 中使用其他 hash 函数得到的 hash 值加上原来的 SHA1 值就可以做到兼容，同时检测碰撞。**
 - **dn**：表示建议显示的文件名。
 - **tr**：表示 Tracker的 URL，如果有多个 Tracker,则会有多个 `tr` 参数。
 - **x.pe**：表示 Peer 的，格式为 `hostname:port`，`ipv4-literal:port` 或者 `[ipv6-literal]:port`，这些 peer 可以被添加到 peer 列表中用于获取元数据以及后续的文件片段获取。实际上 Magnet 链接中定义了一个通用的参数 `xt` 用于指定类似 `x.pe` 所表示的 p2p 连接，但是由于没有合适的 URI 标识符分配给 BT（比如电驴有 ed2k），所以 BT 使用了这个参数，而不是 `xt`。
 - **so**：定义在 [BEP53 - Magnet URI extension - Select specific file indices for download](http://www.bittorrent.org/beps/bep_0053.html) 中，用于指定下载特定文件，比如 `so=0,2,4,6-8` 表示下载 files 列表中索引为 0,2,4,6,7,8 的这六个文件。

有了磁力链接，客户端就可以向 peer 请求 Torrent 文件的 info 部分了，获取完成后就相当于拥有了 Torrent 文件，也就是有了完整的元数据，继而可以下载资源。


## 参考资料
1. [Wikipedia - Torrent file](https://en.wikipedia.org/wiki/Torrent_file#Draft_extensions)
2. [Online Torrent File Decoder](http://marquisdegeek.com/code_bencode.php)
3. [Online Magnet Link to Torrent File converter](http://magnet2torrent.me/)
4. [Wikipedia - Magnet URI scheme](https://en.wikipedia.org/wiki/Magnet_URI_scheme)
5. [Stack Overflow - What is the difference between URI, URL and URN?](https://stackoverflow.com/questions/4913343/what-is-the-difference-between-uri-url-and-urn)
