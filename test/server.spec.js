'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai

const delay = require('delay')

const multiaddr = require('multiaddr')
const Envelope = require('libp2p/src/record/envelope')
const PeerRecord = require('libp2p/src/record/peer-record')

const RendezvousServer = require('../src/server')

const {
  createPeerId,
  createSignedPeerRecord,
  defaultLibp2pConfig
} = require('./utils')

const testNamespace = 'test-namespace'
const multiaddrs = [multiaddr('/ip4/127.0.0.1/tcp/0')]

describe('rendezvous server', () => {
  const signedPeerRecords = []
  let rServer
  let peerIds

  before(async () => {
    peerIds = await createPeerId({ number: 4 })

    // Create a signed peer record per peer
    for (const peerId of peerIds) {
      const spr = await createSignedPeerRecord(peerId, multiaddrs)
      signedPeerRecords.push(spr)
    }
  })

  afterEach(async () => {
    rServer && await rServer.stop()
  })

  it('can start a rendezvous server', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    await rServer.start()
  })

  it('can add registrations to multiple namespaces', () => {
    const otherNamespace = 'other-namespace'

    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 1 in a different namespace
    rServer.addRegistration(otherNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Add registration for peer 2 in test namespace
    rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    const { registrations: testNsRegistrations } = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(2)

    const { registrations: otherNsRegistrations } = rServer.getRegistrations(otherNamespace)
    expect(otherNsRegistrations).to.have.lengthOf(1)
  })

  it('should be able to limit registrations to get', () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 2 in test namespace
    rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    let r = rServer.getRegistrations(testNamespace, { limit: 1 })
    expect(r.registrations).to.have.lengthOf(1)
    expect(r.cookie).to.exist()

    r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(2)
    expect(r.cookie).to.exist()
  })

  it('can remove registrations from a peer in a given namespace', () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 2 in test namespace
    rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    let r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(2)
    expect(r.cookie).to.exist()

    // Remove registration for peer0
    rServer.removeRegistration(testNamespace, peerIds[1])

    r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)
    expect(r.cookie).to.exist()
  })

  it('can remove all registrations from a peer', () => {
    const otherNamespace = 'other-namespace'

    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 1 in a different namespace
    rServer.addRegistration(otherNamespace, peerIds[1], signedPeerRecords[1], 1000)

    let r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)

    let otherR = rServer.getRegistrations(otherNamespace)
    expect(otherR.registrations).to.have.lengthOf(1)

    // Remove all registrations for peer0
    rServer.removePeerRegistrations(peerIds[1])

    r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(0)

    otherR = rServer.getRegistrations(otherNamespace)
    expect(otherR.registrations).to.have.lengthOf(0)
  })

  it('can attempt to remove a registration for a non existent namespace', () => {
    const otherNamespace = 'other-namespace'

    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    rServer.removeRegistration(otherNamespace, peerIds[1])
  })

  it('can attempt to remove a registration for a non existent peer', () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    let r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)

    // Remove registration for peer0
    rServer.removeRegistration(testNamespace, peerIds[2])

    r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)
  })

  it('gc expired records', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { gcInterval: 300 })

    await rServer.start()

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 500)
    rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    let r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(2)

    // wait for firt record to be removed
    await delay(650)
    r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)

    await delay(400)
    r = rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(0)
  })

  it('only new peers should be returned if cookie given', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get current registrations
    const { cookie, registrations } = rServer.getRegistrations(testNamespace)
    expect(cookie).to.exist()
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)
    expect(registrations[0].signedPeerRecord).to.exist()

    // Validate peer0
    const envelope = await Envelope.openAndCertify(registrations[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope.peerId.toString()).to.eql(peerIds[1].toString())

    // Add registration for peer 2 in test namespace
    rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    // Get second registration by using the cookie
    const { cookie: cookie2, registrations: registrations2 } = rServer.getRegistrations(testNamespace, { cookie })
    expect(cookie2).to.exist()
    expect(cookie2).to.eql(cookie)
    expect(registrations2).to.exist()
    expect(registrations2).to.have.lengthOf(1)
    expect(registrations2[0].signedPeerRecord).to.exist()

    // Validate peer1
    const envelope2 = await Envelope.openAndCertify(registrations2[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope2.peerId.toString()).to.eql(peerIds[2].toString())

    // If no cookie provided, all registrations are given
    const { registrations: registrations3 } = rServer.getRegistrations(testNamespace)
    expect(registrations3).to.exist()
    expect(registrations3).to.have.lengthOf(2)
  })

  it('no new peers should be returned if there are not new peers since latest query', () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get current registrations
    const { cookie, registrations } = rServer.getRegistrations(testNamespace)
    expect(cookie).to.exist()
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)

    // Get registrations with same cookie and no new registration
    const { cookie: cookie2, registrations: registrations2 } = rServer.getRegistrations(testNamespace, { cookie })
    expect(cookie2).to.exist()
    expect(cookie2).to.eql(cookie)
    expect(registrations2).to.exist()
    expect(registrations2).to.have.lengthOf(0)
  })

  it('new data for a peer should be returned if registration updated', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get current registrations
    const { cookie, registrations } = rServer.getRegistrations(testNamespace)
    expect(cookie).to.exist()
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)
    expect(registrations[0].signedPeerRecord).to.exist()

    // Validate peer0
    const envelope = await Envelope.openAndCertify(registrations[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope.peerId.toString()).to.eql(peerIds[1].toString())

    // Add new registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get registrations with same cookie and no new registration
    const { cookie: cookie2, registrations: registrations2 } = rServer.getRegistrations(testNamespace, { cookie })
    expect(cookie2).to.exist()
    expect(cookie2).to.eql(cookie)
    expect(registrations2).to.exist()
    expect(registrations2).to.have.lengthOf(1)
    expect(registrations2[0].signedPeerRecord).to.exist()

    // Validate peer0
    const envelope2 = await Envelope.openAndCertify(registrations2[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope2.peerId.toString()).to.eql(peerIds[1].toString())
  })

  it('get registrations should throw if no stored cookie is provided', () => {
    const badCookie = String(Math.random() + Date.now())
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    })

    const fn = () => {
      rServer.getRegistrations(testNamespace, { cookie: badCookie })
    }

    expect(fn).to.throw('no registrations for the given cookie')
  })

  it('garbage collector should remove cookies of discarded records', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { gcDelay: 300, gcInterval: 300 })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 500)

    // Get current registrations
    const { cookie, registrations } = rServer.getRegistrations(testNamespace)
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)

    // Verify internal state
    expect(rServer.nsRegistrations.get(testNamespace).size).to.eql(1)
    expect(rServer.cookieRegistrations.get(cookie)).to.exist()

    await delay(800)

    expect(rServer.nsRegistrations.get(testNamespace).size).to.eql(0)
    expect(rServer.cookieRegistrations.get(cookie)).to.not.exist()
  })
})
