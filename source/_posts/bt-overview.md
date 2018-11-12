---
title: BT 增强建议之概述
tags:
  - BT
keywords: []
date: 2018-08-26 17:00:00
categories:
---

在版权意识愈渐加强的今天，BT 流量占全球流量的比重不断下降，这种 p2p 技术的应用在[逐渐衰落](http://www.donews.com/article/detail/4805/11133.html)。但是请记住

- “技术无罪”——纵然据说爱因斯坦也曾对“把原子弹送到了疯子手里”感到后悔。
- “个体重复系统发育”：
  {% blockquote Andrew Tanenbaum, 现代操作系统 %}
  技术的变化会导致某些思想过时并迅速消失，这种情形经常发生。但是，技术的另一种变化还可能使某些思想再次复活。
  {% endblockquote %}

## 总目录

下面进入正题。一个使用 BT 进行下载的过程可以简短地描述如下：

当你获取了一个**磁力链接**或者**种子文件**，使用 BT 客户端打开文件确认下载后，客户端就成为了一个 peer，客户端通过连接 **Tracker** 服务器或者 **DHT** 网络寻找到其他拥有所需要文件分片的 peer，从这些 peer 中下载资源分片，同时客户端也上传数据给其他来索要自己所拥有分片的 peer，以此反复，直到下载完成。

搞清楚这个下载过程中到底发生了什么事情就是记录这个系列文章的目的所在。整个学习过程以 BT 增强建议 [BEP](http://www.bittorrent.org/beps/bep_0000.html) 为主要参考，同时适当参考 [BT 的一个 Java 版本实现源码](https://github.com/atomashpolskiy/bt)。

整个系列分为：

- {% post_link bt-overview %}：主要介绍 BEP 与 Bencode 编码（已完成）
- {% post_link bt-metadata %}：Torrent 种子文件结构与 Magnet 磁力链接的原理（已完成）
- {% post_link bt-tracker %}：作为 Peer 间桥梁的 Tracker 服务器的工作原理（已完成）
- {% post_link bt-peer %}： Peer 间的通信的过程以及以牙还牙策略（已完成）
- DHT：使得 BT 网络脱离 Tracker，实现完全去中心化（已完成）
  - {% post_link dht-kademlia %}
  - {% post_link bt-dht %}
- 进阶功能：BEP 中提出的一些进阶功能（整理中）

用于保证 BT 高速下载时其他应用低时延网络通信的传输层协议 **µTP** 已在独立的博文 {% post_link µtp %} 中介绍。

这个系列将尽可能涵盖所有的 BEP。下面的表格显示了章节与 BEP 的引用关系，因此在每篇文章的参考资料中将不在列举相关 BEP。

## BEP

BEP（BitTorrent Enhancement Proposal）是 BitTorrent 社区仿照 PEP（Python Enhancement Proposal）来改进 BitTorrent 的技术文档，可以视为一种开发方式。一个[规范](http://www.bittorrent.org/beps/bep_0002.html)的 BEP 被提出后可能经历如下的几个过程，但是目前只有 Final，Accepted，Draft，Deferred 四种状态的 BEP。
![BEP 可能经历的过程](bep_possible_paths.png)
同时 Bittorrent 和 Python 还有个相似的共同点，他们的最初设计者都**曾经**是自己项目的终身仁慈独裁者（Benevolent Dictator For Life，[BDFL](https://en.wikipedia.org/wiki/Benevolent_dictator_for_life)）。例如 [BEP1000 - Pending Standards Track Documents](http://www.bittorrent.org/beps/bep_0000.html) 中所说的这个不存在的 BEP13 - Protocol Encryption 一直没能成为正式的 BEP 的原因就和 BitTorrent 的作者 Bram Cohen 反对 BT 流量加密相关。

- 2018年7月，Guido van Rossum 宣布不再担任 Python 社区的 BDFL。
- 2018年8月，在自己一手创办的公司被波场收购后，Bram Cohen 表示自己已经离开了 Bittorrent，[目前在做数字货币相关的工作](https://chia.net/)。

## Bencode

bencode 是 BT 协议在传输数据过程中广泛采用的一种编码格式。主要支持以下四种数据类型的编码：

- **String**：十进制字符串占用字节数 + ‘:’ + 字符串。例如 “spam”会被编码成“4:spam”
- **Integer**：'i' + 十进制整形数字 + 'e'。除 0 之外，不能以 0 开头。例如：i3e、i-3e
- **List**：使用字符 ‘l’ 和 ‘e’ 进行界定，中间是其他元素。例如 *l4:spami:-42ee* 代表列表 *[spam, -42]*
- **Dictionary**：使用字符 ‘d’ 和 ‘e’ 进行界定，中间是每个键值对元素,而且所有键为字符串类型并按字典顺序排列。例如 *d3:cow3:moo4:spam4:eggse* 代表字典 *{cow: moo, spam: eggs}*

## 参考资料

1. [BEP 的 Github 地址](https://github.com/bittorrent/bittorrent.org)
2. [Wikipedia - BitTorrent protocol encryption](https://en.wikipedia.org/wiki/BitTorrent_protocol_encryption)
3. [BT流量识别技术的研究](http://cdmd.cnki.com.cn/Article/CDMD-10614-2010234919.htm)
4. [谈eD2k和电驴的兴衰](http://pcedu.pconline.com.cn/960/9603584_all.html)
5. [Slashdot - BitTorrent Founder Bram Cohen Has Left the Company](https://tech.slashdot.org/story/18/08/20/0457247/bittorrent-founder-bram-cohen-has-left-the-company)