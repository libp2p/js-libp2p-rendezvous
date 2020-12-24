# js-libp2p-rendezvous <!-- omit in toc -->

[![](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](http://protocol.ai)
[![](https://img.shields.io/badge/project-libp2p-yellow.svg?style=flat-square)](http://libp2p.io/)
[![](https://img.shields.io/badge/freenode-%23libp2p-yellow.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23libp2p)
[![](https://img.shields.io/discourse/https/discuss.libp2p.io/posts.svg)](https://discuss.libp2p.io)
[![codecov](https://img.shields.io/codecov/c/github/libp2p/js-libp2p-rendezvous.svg?style=flat-square)](https://codecov.io/gh/libp2p/js-libp2p-rendezvous)
[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/libp2p/js-libp2p-rendezvous/ci?label=ci&style=flat-square)](https://github.com/libp2p/js-libp2p-rendezvous/actions?query=branch%3Amaster+workflow%3Aci+)

> Javascript implementation of the rendezvous server protocol for libp2p

## Lead Maintainer <!-- omit in toc -->

[Vasco Santos](https://github.com/vasco-santos).

## Table of Contents<!-- omit in toc -->

- [Overview](#overview)
- [Usage](#usage)
  - [Install](#install)
  - [Testing](#testing)
  - [CLI](#cli)
  - [Docker Setup](#docker-setup)
- [Garbage Collector](#garbage-collector)
- [Contribute](#contribute)
- [License](#license)

## Overview

Libp2p rendezvous is a lightweight mechanism for generalized peer discovery. It can be used for bootstrap purposes, real time peer discovery, application specific routing, and so on. This module is the implementation of the rendezvous server protocol for libp2p.

See the [SPEC](https://github.com/libp2p/specs/tree/master/rendezvous) for more details.

## Usage

### Install

```bash
> npm install --global libp2p-rendezvous
```

Now you can use the cli command `libp2p-rendezvous-server` to spawn a libp2p rendezvous server. Bear in mind that a MySQL database is required to run the rendezvous server. You can also use this module as a library and implement your own datastore to use a different database. A datastore `interface` is provided in this repository.

### Testing

For running the tests in this module, you will need to have Docker installed. A docker container is used to run a MySQL database for testing purposes.

### CLI

After installing the rendezvous server, you can use its binary. It accepts several arguments: `--datastoreHost`, `--datastoreUser`, `--datastorePassword`, `--datastoreDatabase`, `--enableMemoryDatabase`, `--peerId`, `--listenMultiaddrs`, `--announceMultiaddrs`, `--metricsPort` and `--disableMetrics`

```sh
libp2p-rendezvous-server [--datastoreHost <hostname>] [--datastoreUser <username>] [datastorePassword <password>] [datastoreDatabase <name>] [--enableMemoryDatabase] [--peerId <jsonFilePath>] [--listenMultiaddrs <ma> ... <ma>] [--announceMultiaddrs <ma> ... <ma>] [--metricsPort <port>] [--disableMetrics]
```

For further customization (e.g. swapping the muxer, using other transports, use other database) it is recommended to create a server via the API.

#### Datastore

A rendezvous server needs to leverage a MySQL database as a datastore for the registrations. This needs to be configured in order to run a rendezvous server. You can rely on docker to run a MySQL database using a command like:

```sh
docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=your-secret-pw -e MYSQL_DATABASE=libp2p_rendezvous_db -d mysql:8 --default-authentication-plugin=mysql_native_password
```

Once a MySQL database is running, you can run the rendezvous server by providing the datastore configuration options as follows:

```sh
libp2p-rendezvous-server --datastoreHost 'localhost' --datastoreUser 'root' --datastorePassword 'your-secret-pw' --datastoreDatabase 'libp2p_rendezvous_db'
```

⚠️ For testing purposes you can skip using MySQL and use a memory datastore. **This must not be used in production!**. For this you just need to provide the `--enableMemoryDatabase` option.

#### PeerId

You can create a [PeerId](https://github.com/libp2p/js-peer-id) via its [CLI](https://github.com/libp2p/js-peer-id#cli) and use it in the rendezvous server.

Once you have a generated PeerId json file, you can start the rendezvous with that PeerId by specifying its path via the `--peerId` flag:

```sh
peer-id --type=ed25519 > id.json
libp2p-rendezvous-server --peerId id.json --datastoreHost 'localhost' --datastoreUser 'root' --datastorePassword 'your-secret-pw' --datastoreDatabase 'libp2p_rendezvous_db'
```

#### Multiaddrs

You can specify the libp2p rendezvous server listen and announce multiaddrs. This server is configured with [libp2p-tcp](https://github.com/libp2p/js-libp2p-tcp) and [libp2p-websockets](https://github.com/libp2p/js-libp2p-websockets) and addresses with this transports should be used. It can always be modified via the API.

```sh
libp2p-rendezvous-server --peerId id.json --listenMultiaddrs '/ip4/127.0.0.1/tcp/15002/ws' '/ip4/127.0.0.1/tcp/8000' --announceMultiaddrs '/dns4/test.io/tcp/443/wss/p2p/12D3KooWAuEpJKhCAfNcHycKcZCv9Qy69utLAJ3MobjKpsoKbrGA' '/dns6/test.io/tcp/443/wss/p2p/12D3KooWAuEpJKhCAfNcHycKcZCv9Qy69utLAJ3MobjKpsoKbrGA' --datastoreHost 'localhost' --datastoreUser 'root' --datastorePassword 'your-secret-pw' --datastoreDatabase 'libp2p_rendezvous_db'
```

By default it listens on `/ip4/127.0.0.1/tcp/8000` and `/ip4/127.0.0.1/tcp/15003/ws`. It has no announce multiaddrs specified.

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

TODO: Finish docker setup

```yml
version: '3.1'
services:
  db:
    image: mysql
    volumes:
        - mysql-db:/var/lib/mysql
    command: --default-authentication-plugin=mysql_native_password
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: your-secret-pw
      MYSQL_DATABASE: libp2p_rendezvous_db
    ports:
      - "3306:3306"
volumes:
  mysql-db:
```

### Library

TODO: How to use this module as a library
- Datastores

## Garbage Collector

The rendezvous server has a built in garbage collector (GC) that removes persisted data over time, as it is expired.

The GC job has two different triggers. It will run over time according to the configurable `gcBootDelay` and `gcInterval` options, and it will run if it reaches a configurable `gcMaxRegistrations` threshold.

Taking into account the GC performance, two other factors are considered before the GC interacts with the Datastore. If a configurable number of minimum registrations `gcMinRegistrations` are not stored, the GC job will not act in this GC cycle. Moreover, to avoid multiple attempts of GC when the max threshold is reached, but no records are yet expired, a minimum interval between each job can also be configured with `gcMinInterval`.

## Contribute

Feel free to join in. All welcome. Open an [issue](https://github.com/libp2p/js-libp2p-rendezvous/issues)!

This repository falls under the IPFS [Code of Conduct](https://github.com/ipfs/community/blob/master/code-of-conduct.md).

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/contributing.md)

## License

MIT - Protocol Labs 2020

[multiaddr]: https://github.com/multiformats/js-multiaddr
