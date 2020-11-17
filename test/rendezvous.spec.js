'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai
const sinon = require('sinon')
const pWaitFor = require('p-wait-for')

const multiaddr = require('multiaddr')
const Envelope = require('libp2p/src/record/envelope')
const PeerRecord = require('libp2p/src/record/peer-record')

const Rendezvous = require('../src')
const { codes: errCodes } = require('../src/errors')

const {
  createPeer,
  createRendezvousServer,
  connectPeers
} = require('./utils')
const { MULTIADDRS_WEBSOCKETS } = require('./fixtures/browser')
const relayAddr = MULTIADDRS_WEBSOCKETS[0]

const namespace = 'ns'

describe('rendezvous', () => {
  describe('start and stop', () => {
    let peer, rendezvous

    beforeEach(async () => {
      [peer] = await createPeer()
      rendezvous = new Rendezvous({ libp2p: peer })
    })

    afterEach(async () => {
      await rendezvous.stop()
      await peer.stop()
    })

    it('can be started and stopped', async () => {
      const spyRegister = sinon.spy(peer.registrar, 'register')
      const spyUnregister = sinon.spy(peer.registrar, 'unregister')

      await rendezvous.start()
      await rendezvous.stop()

      expect(spyRegister).to.have.property('callCount', 1)
      expect(spyUnregister).to.have.property('callCount', 1)
    })

    it('registers the protocol once, if multiple starts', async () => {
      const spyRegister = sinon.spy(peer.registrar, 'register')

      await rendezvous.start()
      await rendezvous.start()

      expect(spyRegister).to.have.property('callCount', 1)

      await rendezvous.stop()
    })

    it('only unregisters on stop if already started', async () => {
      const spyUnregister = sinon.spy(peer.registrar, 'unregister')

      await rendezvous.stop()

      expect(spyUnregister).to.have.property('callCount', 0)
    })
  })

  describe('connectivity', () => {
    let rendezvousServer
    let client

    // Create and start Libp2p nodes
    beforeEach(async () => {
      // Create Rendezvous Server
      rendezvousServer = await createRendezvousServer()

      // Create Rendezvous client
      ;[client] = await createPeer()

      const rendezvous = new Rendezvous({ libp2p: client })
      client.rendezvous = rendezvous
      client.rendezvous.start()
    })

    // Connect nodes to the testing relay node
    beforeEach(async () => {
      await rendezvousServer.dial(relayAddr)
      await client.dial(relayAddr)
    })

    afterEach(async () => {
      await rendezvousServer.stop()
      await client.rendezvous.stop()
      await client.stop()
    })

    it('updates known rendezvous points', async () => {
      expect(client.rendezvous._rendezvousPoints.size).to.equal(0)

      // Connect each other via relay node
      const m = multiaddr(`${relayAddr}/p2p-circuit/p2p/${rendezvousServer.peerId.toB58String()}`)
      const connection = await client.dial(m)

      expect(client.peerStore.peers.size).to.equal(2)
      expect(rendezvousServer.peerStore.peers.size).to.equal(2)

      // Wait event propagation
      // Relay peer is not with rendezvous enabled
      await pWaitFor(() => client.rendezvous._rendezvousPoints.size === 1)

      expect(client.rendezvous._rendezvousPoints.get(rendezvousServer.peerId.toB58String())).to.exist()

      await connection.close()

      // Wait event propagation
      await pWaitFor(() => client.rendezvous._rendezvousPoints.size === 0)
    })
  })

  describe('api', () => {
    let rendezvousServer
    let clients

    // Create and start Libp2p nodes
    beforeEach(async () => {
      // Create Rendezvous Server
      rendezvousServer = await createRendezvousServer()

      clients = await createPeer({ number: 2 })

      // Create 2 rendezvous clients
      clients.forEach((peer) => {
        const rendezvous = new Rendezvous({ libp2p: peer })
        rendezvous.start()
        peer.rendezvous = rendezvous
      })
    })

    afterEach(async () => {
      await rendezvousServer.stop()

      for (const peer of clients) {
        await peer.rendezvous.stop()
        await peer.stop()
      }
    })

    it('register throws error if a namespace is not provided', async () => {
      await expect(clients[0].rendezvous.register())
        .to.eventually.rejected()
        .and.have.property('code', errCodes.INVALID_NAMESPACE)
    })

    it('register throws error if ttl is too small', async () => {
      await expect(clients[0].rendezvous.register(namespace, { ttl: 10 }))
        .to.eventually.rejected()
        .and.have.property('code', errCodes.INVALID_TTL)
    })

    it('register throws error if no connected rendezvous servers', async () => {
      await expect(clients[0].rendezvous.register(namespace))
        .to.eventually.rejected()
        .and.have.property('code', errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    })

    it('register to a connected rendezvous server node', async () => {
      await connectPeers(clients[0], rendezvousServer)

      // Register
      expect(rendezvousServer.nsRegistrations.size).to.eql(0)
      await clients[0].rendezvous.register(namespace)

      expect(rendezvousServer.nsRegistrations.size).to.eql(1)
      expect(rendezvousServer.nsRegistrations.get(namespace)).to.exist()
    })

    it('unregister throws if a namespace is not provided', async () => {
      await expect(clients[0].rendezvous.unregister())
        .to.eventually.rejected()
        .and.have.property('code', errCodes.INVALID_NAMESPACE)
    })

    it('register throws error if no connected rendezvous servers', async () => {
      await expect(clients[0].rendezvous.unregister(namespace))
        .to.eventually.rejected()
        .and.have.property('code', errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    })

    it('unregister to a connected rendezvous server node', async () => {
      await connectPeers(clients[0], rendezvousServer)

      // Register
      expect(rendezvousServer.nsRegistrations.size).to.eql(0)
      await clients[0].rendezvous.register(namespace)

      expect(rendezvousServer.nsRegistrations.size).to.eql(1)
      expect(rendezvousServer.nsRegistrations.get(namespace)).to.exist()

      // Unregister
      await clients[0].rendezvous.unregister(namespace)
      expect(rendezvousServer.nsRegistrations.size).to.eql(0)
    })

    it('unregister to a connected rendezvous server node not fails if not registered', async () => {
      await connectPeers(clients[0], rendezvousServer)

      // Unregister
      await clients[0].rendezvous.unregister(namespace)
    })

    it('discover throws error if a namespace is not provided', async () => {
      try {
        for await (const _ of clients[0].rendezvous.discover()) {} // eslint-disable-line
      } catch (err) {
        expect(err).to.exist()
        expect(err.code).to.eql(errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
        return
      }
      throw new Error('discover should throw error if a namespace is not provided')
    })

    it('discover does not find any register if there is none', async () => {
      await connectPeers(clients[0], rendezvousServer)

      for await (const reg of clients[0].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }
    })

    it('discover find registered peer for namespace', async () => {
      await connectPeers(clients[0], rendezvousServer)
      await connectPeers(clients[1], rendezvousServer)

      const registers = []

      // Peer2 does not discovery any peer registered
      for await (const reg of clients[1].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }

      // Peer0 register itself on namespace (connected to Peer1)
      await clients[0].rendezvous.register(namespace)

      // Peer2 discovers Peer0 registered in Peer1
      for await (const reg of clients[1].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers).to.have.lengthOf(1)
      expect(registers[0].signedPeerRecord).to.exist()
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()

      // Validate envelope
      const envelope = await Envelope.openAndCertify(registers[0].signedPeerRecord, PeerRecord.DOMAIN)
      const rec = PeerRecord.createFromProtobuf(envelope.payload)

      expect(rec.multiaddrs).to.eql(clients[0].multiaddrs)
    })

    it('discover find registered peer for namespace once (cookie usage)', async () => {
      await connectPeers(clients[0], rendezvousServer)
      await connectPeers(clients[1], rendezvousServer)

      const registers = []

      // Peer2 does not discovery any peer registered
      for await (const reg of clients[1].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }

      // Peer0 register itself on namespace (connected to Peer1)
      await clients[0].rendezvous.register(namespace)

      // Peer2 discovers Peer0 registered in Peer1
      for await (const reg of clients[1].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers).to.have.lengthOf(1)
      expect(registers[0].signedPeerRecord).to.exist()
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()

      for await (const reg of clients[1].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers).to.have.lengthOf(1)
    })
  })

  describe('flows with two rendezvous servers available', () => {
    let rendezvousServers = []
    let clients

    const connectPeers = async (peer, otherPeer) => {
      // Connect each other via relay node
      const m = multiaddr(`${relayAddr}/p2p-circuit/p2p/${otherPeer.peerId.toB58String()}`)
      await peer.dial(m)

      // Wait event propagation
      await pWaitFor(() => peer.rendezvous._rendezvousPoints.size === rendezvousServers.length)
    }

    // Create and start Libp2p nodes
    beforeEach(async () => {
      // Create Rendezvous Server
      rendezvousServers = await Promise.all([
        createRendezvousServer(),
        createRendezvousServer()
      ])

      clients = await createPeer({ number: 2 })

      // Create 2 rendezvous clients
      clients.forEach((peer) => {
        const rendezvous = new Rendezvous({ libp2p: peer })
        rendezvous.start()
        peer.rendezvous = rendezvous
      })

      // Connect to testing relay node
      await Promise.all(clients.map((libp2p) => libp2p.dial(relayAddr)))
      await Promise.all(rendezvousServers.map((libp2p) => libp2p.dial(relayAddr)))
    })

    afterEach(async () => {
      await Promise.all(rendezvousServers.map((libp2p) => libp2p.stop()))
      await Promise.all(clients.map((libp2p) => {
        libp2p.rendezvous.stop()
        return libp2p.stop()
      }))
    })

    it('discover find registered peer for namespace only when registered ', async () => {
      // Connect all the clients to all the servers
      await Promise.all(rendezvousServers.map((server) =>
        Promise.all(clients.map((client) => connectPeers(client, server)))))

      const registers = []

      // Client 1 does not discovery any peer registered
      for await (const reg of clients[1].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }

      // Client 0 register itself on namespace (connected to Peer1)
      await clients[0].rendezvous.register(namespace)

      // Client1 discovers Client0
      for await (const reg of clients[1].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers[0].signedPeerRecord).to.exist()
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()

      // Client0 unregister itself on namespace
      await clients[0].rendezvous.unregister(namespace)

      // Peer2 does not discovery any peer registered
      for await (const reg of clients[1].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }
    })
  })
})
