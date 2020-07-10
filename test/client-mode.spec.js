'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai
const sinon = require('sinon')

const Rendezvous = require('../src')

const { createPeer } = require('./utils')

describe('client mode', () => {
  let peer, rendezvous

  afterEach(async () => {
    peer && await peer.stop()
    rendezvous && await rendezvous.stop()
  })

  it('registers a rendezvous handler by default', async () => {
    [peer] = await createPeer()
    rendezvous = new Rendezvous({ libp2p: peer })

    const spyHandle = sinon.spy(peer.registrar, '_handle')

    await rendezvous.start()

    expect(spyHandle).to.have.property('callCount', 1)
  })

  it('can be started only in client mode', async () => {
    [peer] = await createPeer()
    rendezvous = new Rendezvous({
      libp2p: peer,
      options: {
        server: {
          enabled: false
        }
      }
    })

    const spyHandle = sinon.spy(peer.registrar, '_handle')

    await rendezvous.start()
    expect(spyHandle).to.have.property('callCount', 0)
  })
})
