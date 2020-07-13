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

describe('connectivity', () => {
  let peers

  beforeEach(async () => {
    // Create libp2p nodes
    peers = await createPeer({
      number: 2
    })

    // Create && start rendezvous
    peers.map((libp2p) => {
      const rendezvous = new Rendezvous({ libp2p })
      rendezvous.start()
      libp2p.rendezvous = rendezvous
    })

    // Connect to testing relay node
    await Promise.all(peers.map((libp2p) => libp2p.dial(relayAddr)))
  })

  afterEach(() => peers.map(async (libp2p) => {
    await libp2p.rendezvous.stop()
    await libp2p.stop()
  }))

  it('updates known rendezvous points', async () => {
    expect(peers[0].rendezvous._rendezvousPoints.size).to.equal(0)
    expect(peers[1].rendezvous._rendezvousPoints.size).to.equal(0)

    // Connect each other via relay node
    const m = multiaddr(`${relayAddr}/p2p-circuit/p2p/${peers[1].peerId.toB58String()}`)
    const connection = await peers[0].dial(m)

    expect(peers[0].peerStore.peers.size).to.equal(2)
    expect(peers[1].peerStore.peers.size).to.equal(2)

    // Wait event propagation
    // Relay peer is not with rendezvous enabled
    await pWaitFor(() =>
      peers[0].rendezvous._rendezvousPoints.size === 1 &&
      peers[1].rendezvous._rendezvousPoints.size === 1)

    expect(peers[0].rendezvous._rendezvousPoints.get(peers[1].peerId.toB58String())).to.exist()
    expect(peers[1].rendezvous._rendezvousPoints.get(peers[0].peerId.toB58String())).to.exist()

    await connection.close()

    // Wait event propagation
    await pWaitFor(() => peers[0].rendezvous._rendezvousPoints.size === 0)
  })
})
