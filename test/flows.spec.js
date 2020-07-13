'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
const { expect } = chai

const pWaitFor = require('p-wait-for')
const multiaddr = require('multiaddr')

const Rendezvous = require('../src')

const { MULTIADDRS_WEBSOCKETS } = require('./fixtures/browser')
const relayAddr = MULTIADDRS_WEBSOCKETS[0]
const { createPeer } = require('./utils')

const namespace = 'ns'

describe('flows', () => {
  describe('3 rendezvous all acting as rendezvous point', () => {
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
      expect(registers[0].id.toB58String()).to.eql(peers[0].peerId.toB58String())
      expect(registers[0].multiaddrs).to.eql(peers[0].multiaddrs)
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

    })
  })

  describe('3 rendezvous, one acting as rendezvous point', () => {

  })
})
