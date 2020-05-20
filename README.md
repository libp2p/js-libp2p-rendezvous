# js-libp2p-rendezvous

[![](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](http://protocol.ai)
[![](https://img.shields.io/badge/project-libp2p-yellow.svg?style=flat-square)](http://libp2p.io/)
[![](https://img.shields.io/badge/freenode-%23libp2p-yellow.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23libp2p)
[![](https://img.shields.io/discourse/https/discuss.libp2p.io/posts.svg)](https://discuss.libp2p.io)

> Javascript implementation of the rendezvous protocol for libp2p

## Overview

Libp2p rendezvous is a lightweight mechanism for generalized peer discovery. It can be used for bootstrap purposes, real time peer discovery, application specific routing, and so on. Any node implementing the rendezvous protocol can act as a rendezvous point, allowing the discovery of relevant peers in a decentralized fashion.

See https://github.com/libp2p/specs/tree/master/rendezvous for more details

## Lead Maintainer

[Vasco Santos](https://github.com/vasco-santos).

## API

### rendezvous.register

Registers the peer in a given namespace.

`rendezvous.register(namespace, [ttl])`

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| namespace | `string` | namespace to register |
| ttl | `number` | registration ttl in ms (default: `7200e3` and minimum `120`) |

#### Returns

| Type | Description |
|------|-------------|
| `Promise<number>` | Remaining ttl value |

#### Example

```js
// ...
const ttl = await rendezvous.register(namespace)
```

### rendezvous.unregister

Unregisters the peer from a given namespace.

`rendezvous.unregister(namespace)`

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| namespace | `string` | namespace to unregister |

#### Returns

| Type | Description |
|------|-------------|
| `Promise<void>` | Operation resolved |

#### Example

```js
// ...
await rendezvous.register(namespace)
await rendezvous.unregister(namespace)
```

### rendezvous.discover

Discovers peers registered under a given namespace.

`rendezvous.discover(namespace, [limit], [cookie])`

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| namespace | `string` | namespace to discover |
| limit | `number` | limit of peers to discover |
| cookie | `Buffer` |  |

#### Returns

| Type | Description |
|------|-------------|
| `AsyncIterable<{ id: PeerId, signedPeerRecord: Envelope, ns: string, ttl: number }>` | Async Iterable registrations |

#### Example

```js
// ...
await rendezvous.register(namespace)

for await (const reg of rendezvous.discover(namespace)) {
  console.log(reg.id, reg.signedPeerRecord, reg.ns, reg.ttl)
}
```

## Contribute

Feel free to join in. All welcome. Open an [issue](https://github.com/libp2p/js-libp2p-pubsub-peer-discovery/issues)!

This repository falls under the IPFS [Code of Conduct](https://github.com/ipfs/community/blob/master/code-of-conduct.md).

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/contributing.md)

## License

MIT - Protocol Labs 2020

[multiaddr]: https://github.com/multiformats/js-multiaddr
