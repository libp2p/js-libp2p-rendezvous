# Rendezvous Protocol in js-libp2p

The rendezvous protocol can be used in different contexts across libp2p. For using it, the libp2p network needs to have well known libp2p nodes acting as rendezvous servers. These nodes will have an extra role in the network. They will collect and maintain a list of registrations per rendezvous namespace. Other peers in the network will act as rendezvous clients and will register themselves on given namespaces by messaging a rendezvous server node. Taking into account these registrations, a rendezvous client is able to discover other peers in a given namespace by querying a server.

## Usage

`js-libp2p` supports the usage of the rendezvous protocol through its configuration. It allows to enable the rendezvous protocol, as well as its server mode, enable automatic peer discover and to specify the topics to register from startup.

The rendezvous comes with a discovery service that enables libp2p to automatically discover other peers in the provided namespaces and eventually connect to them.
**TODO: it should be compliant with the peer-discovery interface and configured as any other discovery service instead!!**

You can configure it through libp2p as follows:

```js
const Libp2p = require('libp2p')

const node = await Libp2p.create({
  // ... required configurations
  rendezvous: {
    enabled: true,
    namespaces: ['/namespace/1', '/namespace/2'],
    discovery: {
      enabled: true,
      interval: 1000
    },
    server: {
      enabled: true
    }
  }
})
```

While `js-libp2p` supports the rendezvous protocol out of the box, it also provides a rendezvous API that users can interact with. This API should allow users to register new rendezvous namespaces, unregister from previously registered namespaces and to manually discover other peers.

## Libp2p Flow

When a libp2p node with the rendezvous protocol enabled starts, it should start by connecting to a rendezvous server and ask for nodes in the given namespaces. The rendezvous server can be added to the bootstrap nodes or manually dialed. An example of a namespace could be a relay namespace, so that undiable nodes can register themselves as reachable through that relay.

If the discovery service is disabled, the rendezvous API should allow users to discover peers registered on provided namespaces.

When a libp2p node running the rendezvous protocol is going to stop, it should unregister from all the namespaces previously registered.

In the event of a rendezvous client getting connected to a second rendezvous server, it should propagate its registrations to it. The rendezvous server should clean its registrations for a peer when it is not connected with it anymore.

## Other notes:

After a query is made, who is responsible for determining if we need more records? (cookie reuse)
