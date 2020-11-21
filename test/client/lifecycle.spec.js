'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai
const sinon = require('sinon')

const Rendezvous = require('../../src')

const {
  createPeer
} = require('../utils')

describe('rendezvous lifecycle', () => {
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
    const spyPeerStoreListener = sinon.spy(peer.peerStore, 'on')
    const spyPeerStoreRemoveListener = sinon.spy(peer.peerStore, 'removeListener')

    await rendezvous.start()

    expect(spyPeerStoreListener).to.have.property('callCount', 1)
    expect(spyPeerStoreRemoveListener).to.have.property('callCount', 0)

    await rendezvous.stop()

    expect(spyPeerStoreListener).to.have.property('callCount', 1)
    expect(spyPeerStoreRemoveListener).to.have.property('callCount', 1)
  })

  it('adds event handlers once, if multiple starts', async () => {
    const spyPeerStoreListener = sinon.spy(peer.peerStore, 'on')

    await rendezvous.start()
    await rendezvous.start()

    expect(spyPeerStoreListener).to.have.property('callCount', 1)

    await rendezvous.stop()
  })

  it('only removes handlers on stop if already started', async () => {
    const spyPeerStoreRemoveListener = sinon.spy(peer.peerStore, 'removeListener')

    await rendezvous.stop()

    expect(spyPeerStoreRemoveListener).to.have.property('callCount', 0)
  })
})
