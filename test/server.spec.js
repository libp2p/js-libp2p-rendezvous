'use strict'
/* eslint-env mocha */

const { expect } = require('aegir/utils/chai')
const delay = require('delay')

const multiaddr = require('multiaddr')
const Envelope = require('libp2p/src/record/envelope')
const PeerRecord = require('libp2p/src/record/peer-record')

const RendezvousServer = require('../src/server')
const { codes: errCodes } = require('../src/server/errors')
const {
  createPeerId,
  createSignedPeerRecord,
  createDatastore,
  defaultLibp2pConfig
} = require('./utils')

const testNamespace = 'test-namespace'
const multiaddrs = [multiaddr('/ip4/127.0.0.1/tcp/0')]

describe('rendezvous server', () => {
  const signedPeerRecords = []
  let rServer
  let peerIds
  let datastore

  before(async () => {
    peerIds = await createPeerId({ number: 4 })

    // Create a signed peer record per peer
    for (const peerId of peerIds) {
      const spr = await createSignedPeerRecord(peerId, multiaddrs)
      signedPeerRecords.push(spr.marshal())
    }

    datastore = createDatastore()
  })

  afterEach(async () => {
    await datastore.reset()
    rServer && await rServer.stop()
  })

  it('can start a rendezvous server', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })

    await rServer.start()
  })

  it('can add registrations to multiple namespaces', async () => {
    const otherNamespace = 'other-namespace'

    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 1 in a different namespace
    await rServer.addRegistration(otherNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Add registration for peer 2 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    const { registrations: testNsRegistrations } = await rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(2)

    const { registrations: otherNsRegistrations } = await rServer.getRegistrations(otherNamespace)
    expect(otherNsRegistrations).to.have.lengthOf(1)
  })

  it('should be able to limit registrations to get', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 2 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    let r = await rServer.getRegistrations(testNamespace, { limit: 1 })
    expect(r.registrations).to.have.lengthOf(1)
    expect(r.cookie).to.exist()

    r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(2)
    expect(r.cookie).to.exist()
  })

  it('can remove registrations from a peer in a given namespace', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 2 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    let r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(2)
    expect(r.cookie).to.exist()

    // Remove registration for peer0
    await rServer.removeRegistration(testNamespace, peerIds[1])

    r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)
    expect(r.cookie).to.exist()
  })

  it('can remove all registrations from a peer', async () => {
    const otherNamespace = 'other-namespace'

    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)
    // Add registration for peer 1 in a different namespace
    await rServer.addRegistration(otherNamespace, peerIds[1], signedPeerRecords[1], 1000)

    let r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)

    let otherR = await rServer.getRegistrations(otherNamespace)
    expect(otherR.registrations).to.have.lengthOf(1)

    // Remove all registrations for peer0
    await rServer.removePeerRegistrations(peerIds[1])

    r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(0)

    otherR = await rServer.getRegistrations(otherNamespace)
    expect(otherR.registrations).to.have.lengthOf(0)
  })

  it('can attempt to remove a registration for a non existent namespace', async () => {
    const otherNamespace = 'other-namespace'

    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    await rServer.removeRegistration(otherNamespace, peerIds[1])
  })

  it('can attempt to remove a registration for a non existent peer', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    let r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)

    // Remove registration for peer0
    await rServer.removeRegistration(testNamespace, peerIds[2])

    r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)
  })

  it('only new peers should be returned if cookie given', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get current registrations
    const { cookie, registrations } = await rServer.getRegistrations(testNamespace)
    expect(cookie).to.exist()
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)
    expect(registrations[0].signedPeerRecord).to.exist()

    // Validate peer0
    const envelope = await Envelope.openAndCertify(registrations[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope.peerId.toString()).to.eql(peerIds[1].toString())

    // Add registration for peer 2 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    // Get second registration by using the cookie
    const { cookie: cookie2, registrations: registrations2 } = await rServer.getRegistrations(testNamespace, { cookie })
    expect(cookie2).to.exist()
    expect(cookie2).to.eql(cookie)
    expect(registrations2).to.exist()
    expect(registrations2).to.have.lengthOf(1)
    expect(registrations2[0].signedPeerRecord).to.exist()

    // Validate peer1
    const envelope2 = await Envelope.openAndCertify(registrations2[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope2.peerId.toString()).to.eql(peerIds[2].toString())

    // If no cookie provided, all registrations are given
    const { registrations: registrations3 } = await rServer.getRegistrations(testNamespace)
    expect(registrations3).to.exist()
    expect(registrations3).to.have.lengthOf(2)
  })

  it('no new peers should be returned if there are not new peers since latest query', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get current registrations
    const { cookie, registrations } = await rServer.getRegistrations(testNamespace)
    expect(cookie).to.exist()
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)

    // Get registrations with same cookie and no new registration
    const { cookie: cookie2, registrations: registrations2 } = await rServer.getRegistrations(testNamespace, { cookie })
    expect(cookie2).to.exist()
    expect(cookie2).to.eql(cookie)
    expect(registrations2).to.exist()
    expect(registrations2).to.have.lengthOf(0)
  })

  it('new data for a peer should be returned if registration updated', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get current registrations
    const { cookie, registrations } = await rServer.getRegistrations(testNamespace)
    expect(cookie).to.exist()
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)
    expect(registrations[0].signedPeerRecord).to.exist()

    // Validate peer0
    const envelope = await Envelope.openAndCertify(registrations[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope.peerId.toString()).to.eql(peerIds[1].toString())

    // Add new registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 1000)

    // Get registrations with same cookie and no new registration
    const { cookie: cookie2, registrations: registrations2 } = await rServer.getRegistrations(testNamespace, { cookie })
    expect(cookie2).to.exist()
    expect(cookie2).to.eql(cookie)
    expect(registrations2).to.exist()
    expect(registrations2).to.have.lengthOf(1)
    expect(registrations2[0].signedPeerRecord).to.exist()

    // Validate peer0
    const envelope2 = await Envelope.openAndCertify(registrations2[0].signedPeerRecord, PeerRecord.DOMAIN)
    expect(envelope2.peerId.toString()).to.eql(peerIds[1].toString())
  })

  it('get registrations should throw if no stored cookie is provided', async () => {
    const badCookie = String(Math.random() + Date.now())
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore })
    await rServer.start()

    await expect(rServer.getRegistrations(testNamespace, { cookie: badCookie }))
      .to.eventually.be.rejectedWith(Error)
      .and.to.have.property('code', errCodes.INVALID_COOKIE)
  })

  it.skip('gc expired records', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore, gcInterval: 300 })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 500)
    await rServer.addRegistration(testNamespace, peerIds[2], signedPeerRecords[2], 1000)

    let r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(2)

    // wait for firt record to be removed
    await delay(650)
    r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(1)

    await delay(400)
    r = await rServer.getRegistrations(testNamespace)
    expect(r.registrations).to.have.lengthOf(0)
  })

  it.skip('garbage collector should remove cookies of discarded records', async () => {
    rServer = new RendezvousServer({
      ...defaultLibp2pConfig,
      peerId: peerIds[0]
    }, { datastore, gcDelay: 300, gcInterval: 300 })
    await rServer.start()

    // Add registration for peer 1 in test namespace
    await rServer.addRegistration(testNamespace, peerIds[1], signedPeerRecords[1], 500)

    // Get current registrations
    const { registrations } = await rServer.getRegistrations(testNamespace)
    expect(registrations).to.exist()
    expect(registrations).to.have.lengthOf(1)

    // Verify internal state
    // expect(rServer.datastore.nsRegistrations.get(testNamespace).size).to.eql(1)
    // expect(rServer.datastore.cookieRegistrations.get(cookie)).to.exist()

    await delay(800)

    // expect(rServer.datastore.nsRegistrations.get(testNamespace).size).to.eql(0)
    // expect(rServer.datastore.cookieRegistrations.get(cookie)).to.not.exist()
  })
})
