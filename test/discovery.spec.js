'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai

const delay = require('delay')
const pDefer = require('p-defer')
const testsDiscovery = require('libp2p-interfaces/src/peer-discovery/tests')

const Rendezvous = require('../src')

const { createPeer, connectPeers } = require('./utils')

describe('rendezvous discovery', () => {
  let peers

  // Create 3 rendezvous peers
  // Peer0 will be a server
  beforeEach(async () => {
    peers = await createPeer({ number: 3 })

    peers.forEach((peer, index) => {
      const rendezvous = new Rendezvous({
        libp2p: peer,
        options: {
          discovery: {
            interval: 1000
          },
          server: {
            enabled: index === 0
          }
        }
      })
      rendezvous.start()
      peer.rendezvous = rendezvous
    })
  })

  // Connect rendezvous clients to server
  beforeEach(async () => {
    await connectPeers(peers[1], peers[0])
    await connectPeers(peers[2], peers[0])

    expect(peers[0].rendezvous._rendezvousConns.size).to.eql(0)
    expect(peers[1].rendezvous._rendezvousConns.size).to.eql(1)
    expect(peers[2].rendezvous._rendezvousConns.size).to.eql(1)
  })

  afterEach(async () => {
    for (const peer of peers) {
      peer.rendezvous.discovery.stop()
      await peer.rendezvous.stop()
      await peer.stop()
    }
  })

  it('peer1 should discover peer2 once it registers to the same namespace', async () => {
    const defer = pDefer()
    const namespace = 'test-namespace'
    peers[1].rendezvous._namespaces = [namespace]

    // Start discovery
    peers[1].rendezvous.discovery.once('peer', (peer) => {
      expect(peer.id.equals(peers[2].peerId)).to.be.true()
      expect(peer.multiaddrs).to.eql(peers[2].multiaddrs)
      defer.resolve()
    })
    peers[1].rendezvous.discovery.start()

    // Register
    expect(peers[0].rendezvous._server.registrations.size).to.eql(0)
    await peers[2].rendezvous.register(namespace)
    expect(peers[0].rendezvous._server.registrations.size).to.eql(1)

    await defer.promise
  })

  it.skip('peer1 should not discover peer2 if it registers in a different namespace', async () => {
    const namespace1 = 'test-namespace1'
    const namespace2 = 'test-namespace2'
    await peers[1].rendezvous.register(namespace1)

    // Start discovery
    peers[1].rendezvous.discovery.once('peer', () => {
      throw new Error('no peer should be discovered')
    })
    peers[1].rendezvous.discovery.start()

    // Register
    expect(peers[0].rendezvous._server.registrations.size).to.eql(0)
    await peers[2].rendezvous.register(namespace2)
    expect(peers[0].rendezvous._server.registrations.size).to.eql(1)

    await delay(1500)
  })
})

describe('interface-discovery', () => {
  let peers

  beforeEach(async () => {
    peers = await createPeer({ number: 2 })

    peers.forEach((peer, index) => {
      const rendezvous = new Rendezvous({
        libp2p: peer,
        options: {
          discovery: {
            interval: 1000
          },
          namespaces: ['test-namespace'],
          server: {
            enabled: index === 0
          }
        }
      })
      rendezvous.start()
      peer.rendezvous = rendezvous
    })

    await connectPeers(peers[1], peers[0])
  })

  testsDiscovery({
    setup () {
      return peers[1].rendezvous.discovery
    },
    teardown () {
      return Promise.all(peers.map(async (libp2p) => {
        await libp2p.rendezvous.stop()
        await libp2p.stop()
      }))
    }
  })
})
