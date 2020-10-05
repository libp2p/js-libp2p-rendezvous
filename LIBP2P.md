# Rendezvous Protocol in js-libp2p

The rendezvous protocol can be used in different contexts across libp2p. For using it, the libp2p network needs to have well known libp2p nodes acting as rendezvous servers. These nodes will have an extra role in the network. They will collect and maintain a list of registrations per rendezvous namespace. Other peers in the network will act as rendezvous clients and will register themselves on given namespaces by messaging a rendezvous server node. Taking into account these registrations, a rendezvous client is able to discover other peers in a given namespace by querying a server. A registration should have a `ttl`, in order to avoid having invalid registrations.

## Usage

`js-libp2p` supports the usage of the rendezvous protocol through its configuration. It allows the rendezvous protocol to be enabled, as well as its server mode.

You can configure it through libp2p as follows:

```js
const Libp2p = require('libp2p')
const Rendezvous = require('libp2p-rendezvous')

const node = await Libp2p.create({
  modules: {
    rendezvous: Rendezvous
  },
  config: {
    rendezvous: {
      server: {
        enabled: false
      }
    }
  }
})
```

While `js-libp2p` supports the rendezvous protocol out of the box through its discovery API, it also provides a rendezvous API that users can interact with. This API allows users to register new rendezvous namespaces, unregister from previously registered namespaces and to manually discover peers.

## Libp2p Flow

When a libp2p node with the rendezvous protocol enabled starts, it should start by connecting to a rendezvous server. The rendezvous server can be added to the bootstrap nodes or manually dialed. WHen a rendezvous server is connected, the node can ask for nodes in given namespaces. An example of a namespace could be a relay namespace, so that undiable nodes can register themselves as reachable through that relay.

When a libp2p node running the rendezvous protocol is stopping, it will unregister from all the namespaces previously registered.
