'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
const { expect } = chai

const delay = require('delay')
const sinon = require('sinon')
const multiaddr = require('multiaddr')

const RendezvousServer = require('../src/server')

const { createPeerId } = require('./utils')

const registrar = {
  handle: () => { }
}
const testNamespace = 'test-namespace'
const multiaddrs = [multiaddr('/ip4/127.0.0.1/tcp/0')].map((m) => m.buffer)

describe('rendezvous server', () => {
  let rServer
  let peerIds

  before(async () => {
    peerIds = await createPeerId({ number: 3 })
  })

  afterEach(() => {
    rServer && rServer.stop()
  })

  it('calls registrar handle on start once', () => {
    rServer = new RendezvousServer(registrar)

    // Spy for handle
    const spyHandle = sinon.spy(registrar, 'handle')

    rServer.start()
    expect(spyHandle).to.have.property('callCount', 1)

    rServer.start()
    expect(spyHandle).to.have.property('callCount', 1)
  })

  it('can add registrations to multiple namespaces', () => {
    const otherNamespace = 'other-namespace'
    rServer = new RendezvousServer(registrar)

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[0], multiaddrs, 1000)
    // Add registration for peer 1 in a different namespace
    rServer.addRegistration(otherNamespace, peerIds[0], multiaddrs, 1000)

    // Add registration for peer 2 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], multiaddrs, 1000)

    const testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(2)

    const otherNsRegistrations = rServer.getRegistrations(otherNamespace)
    expect(otherNsRegistrations).to.have.lengthOf(1)
  })

  it('should be able to limit registrations to get', () => {
    rServer = new RendezvousServer(registrar)

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[0], multiaddrs, 1000)
    // Add registration for peer 2 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], multiaddrs, 1000)

    let testNsRegistrations = rServer.getRegistrations(testNamespace, 1)
    expect(testNsRegistrations).to.have.lengthOf(1)

    testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(2)
  })

  it('can remove registrations from a peer in a given namespace', () => {
    rServer = new RendezvousServer(registrar)

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[0], multiaddrs, 1000)
    // Add registration for peer 2 in test namespace
    rServer.addRegistration(testNamespace, peerIds[1], multiaddrs, 1000)

    let testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(2)

    // Remove registration for peer0
    rServer.removeRegistration(testNamespace, peerIds[0])

    testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(1)
  })

  it('can remove all registrations from a peer', () => {
    const otherNamespace = 'other-namespace'
    rServer = new RendezvousServer(registrar)

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[0], multiaddrs, 1000)
    // Add registration for peer 1 in a different namespace
    rServer.addRegistration(otherNamespace, peerIds[0], multiaddrs, 1000)

    let testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(1)

    let otherNsRegistrations = rServer.getRegistrations(otherNamespace)
    expect(otherNsRegistrations).to.have.lengthOf(1)

    // Remove all registrations for peer0
    rServer.removePeerRegistrations(peerIds[0])

    testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(0)

    otherNsRegistrations = rServer.getRegistrations(otherNamespace)
    expect(otherNsRegistrations).to.have.lengthOf(0)
  })

  it('can attempt to remove a registration for a non existent namespace', () => {
    const otherNamespace = 'other-namespace'
    rServer = new RendezvousServer(registrar)

    rServer.removeRegistration(otherNamespace, peerIds[0])
  })

  it('can attempt to remove a registration for a non existent peer', () => {
    rServer = new RendezvousServer(registrar)

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[0], multiaddrs, 1000)

    let testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(1)

    // Remove registration for peer0
    rServer.removeRegistration(testNamespace, peerIds[1])

    testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(1)
  })

  it('gc expired records', async () => {
    rServer = new RendezvousServer(registrar, { gcInterval: 300 })

    // Add registration for peer 1 in test namespace
    rServer.addRegistration(testNamespace, peerIds[0], multiaddrs, 500)
    rServer.addRegistration(testNamespace, peerIds[1], multiaddrs, 1000)

    let testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(2)

    // wait for firt record to be removed
    await delay(650)
    testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(1)

    await delay(400)
    testNsRegistrations = rServer.getRegistrations(testNamespace)
    expect(testNsRegistrations).to.have.lengthOf(0)
  })
})
