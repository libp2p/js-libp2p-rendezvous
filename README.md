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

### constructor

Creating an instance of Rendezvous.

`const rendezvous = new Rendezvous({ libp2p })`

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| params | `object` | rendezvous parameters |
| params.libp2p | `Libp2p` | a libp2p node instance |
| params.namespaces | `Array<string>` | namespaces to keep registering and discovering over time (default: `[]`) |
| params.server | `object` | rendezvous server options |
| params.server.enabled | `boolean` | rendezvous server enabled (default: `true`) |
| params.server.gcInterval | `number` | rendezvous garbage collector interval (default: `3e5`) |
| params.discovery | `object` | rendezvous peer discovery options |
| params.discovery.interval | `number` | automatic rendezvous peer discovery interval (default: `5e3`) |

### rendezvous.start

Register the rendezvous protocol topology into libp2p and starts its internal services. The rendezvous server will be started if enabled, as well as the service to keep self registrations available.

`rendezvous.start()`

When registering to new namespaces from the API, the new namespace will be added to the registrations to keep by default.

### rendezvous.stop

Unregister the rendezvous protocol and the streams with other peers will be closed.

`rendezvous.stop()`

### rendezvous.discovery.start

Starts the rendezvous automatic discovery service.

`rendezvous.discovery.start()`

Like other libp2p discovery protocols, it will emit `peer` events when new peers are discovered.

### rendezvous.discovery.stop

Stops the rendezvous automatic discovery service.

`rendezvous.discovery.stop()`

### rendezvous.register

Registers the peer in a given namespace.

`rendezvous.register(namespace, [options])`

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| namespace | `string` | namespace to register |
| options | `object` | rendezvous registrations options |
| options.ttl | `number` | registration ttl in ms (default: `7200e3` and minimum `120`) |
| options.keep | `boolean` | register over time to guarantee availability (default: `true`) |

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

`rendezvous.discover(namespace, [limit])`

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| namespace | `string` | namespace to discover |
| limit | `number` | limit of peers to discover |

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
