'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai

const pWaitFor = require('p-wait-for')
const multiaddr = require('multiaddr')

const Rendezvous = require('../../src')

const {
  createPeer,
  createRendezvousServer
} = require('../utils')
const { MULTIADDRS_WEBSOCKETS } = require('../fixtures/browser')
const relayAddr = MULTIADDRS_WEBSOCKETS[0]

describe('rendezvous connectivity', () => {
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
  })
})
