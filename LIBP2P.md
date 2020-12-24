# Rendezvous Protocol in js-libp2p

The rendezvous protocol can be used in different contexts across libp2p. For using it, the libp2p network needs to have well known libp2p nodes acting as rendezvous servers. These nodes will have an extra role in the network. They will collect and maintain a list of registrations per rendezvous namespace. Other peers in the network will act as rendezvous clients and will register themselves on given namespaces by messaging a rendezvous server node. Taking into account these registrations, a rendezvous client is able to discover other peers in a given namespace by querying a server. A registration should have a `ttl`, in order to avoid having invalid registrations.

## Usage

`js-libp2p` supports the usage of the rendezvous protocol through its configuration. It allows the rendezvous protocol to be enabled and customized.

You can configure it through libp2p as follows:

```js
const Libp2p = require('libp2p')

const node = await Libp2p.create({
  rendezvous: {
    enabled: true,
    rendezvousPoints: ['/dnsaddr/rendezvous.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJP']
  }
})
```

## Libp2p Flow

When a libp2p node with the rendezvous protocol enabled starts, it should start by connecting to the given rendezvous servers. When a rendezvous server is connected, the node can ask for nodes in given namespaces. An example of a namespace could be a relay namespace, so that undialable nodes can register themselves as reachable through that relay.

When a libp2p node running the rendezvous protocol is stopping, it will unregister from all the namespaces previously registered.

## API

This API allows users to register new rendezvous namespaces, unregister from previously registered namespaces and to discover peers on a given namespace.

### Options

| Name | Type | Description |
|------|------|-------------|
| options | `object` | rendezvous parameters |
| options.enabled | `boolean` | is rendezvous enabled |
| options.rendezvousPoints | `Multiaddr[]` | list of multiaddrs of running rendezvous servers |

### rendezvous.start

Start the rendezvous client in the libp2p node.

`rendezvous.start()`

### rendezvous.stop

Clear the rendezvous state and unregister from namespaces.

`rendezvous.stop()`

### rendezvous.register

Registers the peer in a given namespace.

`rendezvous.register(namespace, [options])`

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| namespace | `string` | namespace to register |
| [options] | `Object` | rendezvous registrations options |
| [options.ttl=7.2e6] | `number` | registration ttl in ms |

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
| `AsyncIterable<{ signedPeerRecord: Uint8Array, ns: string, ttl: number }>` | Async Iterable registrations |

#### Example

```js
// ...
await rendezvous.register(namespace)

for await (const reg of rendezvous.discover(namespace)) {
  console.log(reg.signedPeerRecord, reg.ns, reg.ttl)
}
```

## Future Work

- Libp2p can handle re-registers when properly configured
- Rendezvous client should be able to register namespaces given in configuration on startup
  - Not supported at the moment, as we would need to deal with re-register over time