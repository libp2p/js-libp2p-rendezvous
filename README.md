# js-libp2p-rendezvous <!-- omit in toc -->

[![](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](http://protocol.ai)
[![](https://img.shields.io/badge/project-libp2p-yellow.svg?style=flat-square)](http://libp2p.io/)
[![](https://img.shields.io/badge/freenode-%23libp2p-yellow.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23libp2p)
[![](https://img.shields.io/discourse/https/discuss.libp2p.io/posts.svg)](https://discuss.libp2p.io)

> Javascript implementation of the rendezvous protocol for libp2p

## Lead Maintainer <!-- omit in toc -->

[Vasco Santos](https://github.com/vasco-santos).

## Table of Contents<!-- omit in toc -->

- [Overview](#overview)
- [Usage](#usage)
  - [Install](#install)
  - [CLI](#cli)
  - [Docker Setup](#docker-setup)
- [Contribute](#contribute)
- [License](#license)

## Overview

Libp2p rendezvous is a lightweight mechanism for generalized peer discovery. It can be used for bootstrap purposes, real time peer discovery, application specific routing, and so on. Any node implementing the rendezvous protocol can act as a rendezvous point, allowing the discovery of relevant peers in a decentralized fashion.

See the [SPEC](https://github.com/libp2p/specs/tree/master/rendezvous) for more details.

## Usage

### Install

```bash
> npm install --global libp2p-rendezvous
```

Now you can use the cli command `libp2p-rendezvous-server` to spawn a libp2p rendezvous server.

### CLI

After installing the rendezvous server, you can use its binary. It accepts several arguments: `--peerId`, `--listenMultiaddrs`, `--announceMultiaddrs`, `--metricsPort` and `--disableMetrics`

```sh
libp2p-rendezvous-server [--peerId <jsonFilePath>] [--listenMultiaddrs <ma> ... <ma>] [--announceMultiaddrs <ma> ... <ma>] [--metricsPort <port>] [--disableMetrics]
```

For further customization (e.g. swapping the muxer, using other transports) it is recommended to create a server via the API.

#### PeerId

You can create a [PeerId](https://github.com/libp2p/js-peer-id) via its [CLI](https://github.com/libp2p/js-peer-id#cli). 

```sh
libp2p-rendezvous-server --peerId id.json
```

#### Multiaddrs

You can specify the libp2p rendezvous server listen and announce multiaddrs. This server is configured with [libp2p-tcp](https://github.com/libp2p/js-libp2p-tcp) and [libp2p-websockets](https://github.com/libp2p/js-libp2p-websockets) and addresses with this transports should be used. It can always be modified via the API.

```sh
libp2p-rendezvous-server --peerId id.json --listenMultiaddrs '/ip4/127.0.0.1/tcp/15002/ws' '/ip4/127.0.0.1/tcp/8000' --announceMultiaddrs '/dns4/test.io/tcp/443/wss/p2p/12D3KooWAuEpJKhCAfNcHycKcZCv9Qy69utLAJ3MobjKpsoKbrGA' '/dns6/test.io/tcp/443/wss/p2p/12D3KooWAuEpJKhCAfNcHycKcZCv9Qy69utLAJ3MobjKpsoKbrGA'
```

By default it listens on `/ip4/127.0.0.1/tcp/15002/ws` and has no announce multiaddrs specified.

#### Metrics

Metrics are enabled by default on `/ip4/127.0.0.1/tcp/8003` via Prometheus. This port can also be modified with:

```sh
libp2p-rendezvous-server --metricsPort '8008'
```

Moreover, metrics can also be disabled with:

```sh
libp2p-rendezvous-server --disableMetrics
```

### Docker Setup

TODO

## Contribute

Feel free to join in. All welcome. Open an [issue](https://github.com/libp2p/js-libp2p-rendezvous/issues)!

This repository falls under the IPFS [Code of Conduct](https://github.com/ipfs/community/blob/master/code-of-conduct.md).

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/contributing.md)

## License

MIT - Protocol Labs 2020

[multiaddr]: https://github.com/multiformats/js-multiaddr
