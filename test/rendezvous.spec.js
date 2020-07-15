'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai
const sinon = require('sinon')

const Rendezvous = require('../src')
const { codes: errCodes } = require('../src/errors')

const { createPeer, connectPeers } = require('./utils')

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
      expect(registers[0].id.toB58String()).to.eql(peers[0].peerId.toB58String())
      expect(registers[0].multiaddrs).to.eql(peers[0].multiaddrs)
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()
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
      expect(registers[0].id.toB58String()).to.eql(peers[0].peerId.toB58String())
      expect(registers[0].multiaddrs).to.eql(peers[0].multiaddrs)
      expect(registers[0].ns).to.eql(namespace)
      expect(registers[0].ttl).to.exist()

      for await (const reg of peers[2].rendezvous.discover(namespace)) {
        registers.push(reg)
      }

      expect(registers).to.have.lengthOf(1)
    })
  })
})
