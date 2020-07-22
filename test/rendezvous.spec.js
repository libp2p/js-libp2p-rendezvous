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

const { createPeer, connectPeers } = require('./utils')
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

  describe('api', () => {
    let peers

    beforeEach(async () => {
      peers = await createPeer({ number: 3 })

      // Create 3 rendezvous peers
      // Peer0 will not be a server
      peers.forEach((peer, index) => {
        const rendezvous = new Rendezvous({
          libp2p: peer,
          server: {
            enabled: index !== 0
          }
        })
        rendezvous.start()
        peer.rendezvous = rendezvous
      })
    })

    afterEach(async () => {
      for (const peer of peers) {
        await peer.rendezvous.stop()
        await peer.stop()
      }
    })

    it('register throws error if a namespace is not provided', async () => {
      await expect(peers[0].rendezvous.register())
        .to.eventually.rejected()
        .and.have.property('code', errCodes.INVALID_NAMESPACE)
    })

    it('register throws error if ttl is too small', async () => {
      await expect(peers[0].rendezvous.register(namespace, { ttl: 10 }))
        .to.eventually.rejected()
        .and.have.property('code', errCodes.INVALID_TTL)
    })

    it('register throws error if no connected rendezvous servers', async () => {
      await expect(peers[0].rendezvous.register(namespace))
        .to.eventually.rejected()
        .and.have.property('code', errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    })

    it('register to a connected rendezvous server node', async () => {
      await connectPeers(peers[0], peers[1])

      // Register
      expect(peers[1].rendezvous._server.nsRegistrations.size).to.eql(0)
      await peers[0].rendezvous.register(namespace)

      expect(peers[1].rendezvous._server.nsRegistrations.size).to.eql(1)
      expect(peers[1].rendezvous._server.nsRegistrations.get(namespace)).to.exist()

      await peers[1].rendezvous.stop()
      await peers[1].stop()
    })

    it('unregister throws if a namespace is not provided', async () => {
      await expect(peers[0].rendezvous.unregister())
        .to.eventually.rejected()
        .and.have.property('code', errCodes.INVALID_NAMESPACE)
    })

    it('register throws error if no connected rendezvous servers', async () => {
      await expect(peers[0].rendezvous.unregister(namespace))
        .to.eventually.rejected()
        .and.have.property('code', errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
    })

    it('unregister to a connected rendezvous server node', async () => {
      await connectPeers(peers[0], peers[1])

      // Register
      expect(peers[1].rendezvous._server.nsRegistrations.size).to.eql(0)
      await peers[0].rendezvous.register(namespace)

      expect(peers[1].rendezvous._server.nsRegistrations.size).to.eql(1)
      expect(peers[1].rendezvous._server.nsRegistrations.get(namespace)).to.exist()

      // Unregister
      await peers[0].rendezvous.unregister(namespace)
      expect(peers[1].rendezvous._server.nsRegistrations.size).to.eql(0)

      await peers[1].rendezvous.stop()
      await peers[1].stop()
    })

    it('unregister to a connected rendezvous server node not fails if not registered', async () => {
      await connectPeers(peers[0], peers[1])

      // Unregister
      await peers[0].rendezvous.unregister(namespace)

      await peers[1].rendezvous.stop()
    })

    it('discover throws error if a namespace is not provided', async () => {
      try {
        for await (const _ of peers[0].rendezvous.discover()) {} // eslint-disable-line
      } catch (err) {
        expect(err).to.exist()
        expect(err.code).to.eql(errCodes.NO_CONNECTED_RENDEZVOUS_SERVERS)
        return
      }
      throw new Error('discover should throw error if a namespace is not provided')
    })

    it('discover does not find any register if there is none', async () => {
      await connectPeers(peers[0], peers[1])

      for await (const reg of peers[0].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }

      await peers[1].rendezvous.stop()
    })

    it('discover find registered peer for namespace', async () => {
      await connectPeers(peers[0], peers[1])
      await connectPeers(peers[2], peers[1])

      const registers = []

      // Peer2 does not discovery any peer registered
      for await (const reg of peers[2].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }

      // Peer0 register itself on namespace (connected to Peer1)
      await peers[0].rendezvous.register(namespace)

      // Peer2 discovers Peer0 registered in Peer1
      for await (const reg of peers[2].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers).to.have.lengthOf(1)
      expect(registers[0].signedPeerRecord).to.exist()
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()

      // Validate envelope
      const envelope = await Envelope.openAndCertify(registers[0].signedPeerRecord, PeerRecord.DOMAIN)
      const rec = PeerRecord.createFromProtobuf(envelope.payload)

      expect(rec.multiaddrs).to.eql(peers[0].multiaddrs)
    })

    it('discover find registered peer for namespace once (cookie usage)', async () => {
      await connectPeers(peers[0], peers[1])
      await connectPeers(peers[2], peers[1])

      const registers = []

      // Peer2 does not discovery any peer registered
      for await (const reg of peers[2].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }

      // Peer0 register itself on namespace (connected to Peer1)
      await peers[0].rendezvous.register(namespace)

      // Peer2 discovers Peer0 registered in Peer1
      for await (const reg of peers[2].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers).to.have.lengthOf(1)
      expect(registers[0].signedPeerRecord).to.exist()
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()

      for await (const reg of peers[2].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers).to.have.lengthOf(1)
    })
  })

  describe('flows with 3 rendezvous all acting as rendezvous point', () => {
    let peers

    const connectPeers = async (peer, otherPeer) => {
      // Connect each other via relay node
      const m = multiaddr(`${relayAddr}/p2p-circuit/p2p/${otherPeer.peerId.toB58String()}`)
      await peer.dial(m)

      // Wait event propagation
      await pWaitFor(() => peer.rendezvous._rendezvousPoints.size === 1)
    }

    beforeEach(async () => {
      // Create libp2p nodes
      peers = await createPeer({
        number: 3
      })

      // Create 3 rendezvous peers
      peers.forEach((peer) => {
        const rendezvous = new Rendezvous({
          libp2p: peer
        })
        rendezvous.start()
        peer.rendezvous = rendezvous
      })

      // Connect to testing relay node
      await Promise.all(peers.map((libp2p) => libp2p.dial(relayAddr)))
    })

    afterEach(() => peers.map(async (libp2p) => {
      await libp2p.rendezvous.stop()
      await libp2p.stop()
    }))

    it('discover find registered peer for namespace only when registered', async () => {
      await connectPeers(peers[0], peers[1])
      await connectPeers(peers[2], peers[1])

      const registers = []

      // Peer2 does not discovery any peer registered
      for await (const reg of peers[2].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }

      // Peer0 register itself on namespace (connected to Peer1)
      await peers[0].rendezvous.register(namespace)

      // Peer2 discovers Peer0 registered in Peer1
      for await (const reg of peers[2].rendezvous.discover(namespace)) {
        registers.push(reg)
      }
      expect(registers).to.have.lengthOf(1)
      expect(registers[0].signedPeerRecord).to.exist()
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()

      // Peer0 unregister itself on namespace (connected to Peer1)
      await peers[0].rendezvous.unregister(namespace)

      // Peer2 does not discovery any peer registered
      for await (const reg of peers[2].rendezvous.discover(namespace)) { // eslint-disable-line
        throw new Error('no registers should exist')
      }
    })

    it('discovers locally first, and if limit achieved, not go to the network', async () => {
      await connectPeers(peers[0], peers[1])
      await connectPeers(peers[2], peers[1])

      // Peer0 register itself on namespace (connected to Peer1)
      await peers[1].rendezvous.register(namespace)

      const spyRendezvousPoints = sinon.spy(peers[2].rendezvous._rendezvousPoints, 'entries')

      const registers = []
      // Peer2 discovers Peer0 registered in Peer1
      for await (const reg of peers[2].rendezvous.discover(namespace, 1)) {
        registers.push(reg)
      }

      // No need to get the rendezvousPoints connections
      expect(spyRendezvousPoints).to.have.property('callCount', 0)
      expect(registers).to.have.lengthOf(1)
    })
  })
})
