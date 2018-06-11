'use strict'

/* eslint-env mocha */

const {parallel} = require('async')
const Utils = require('./utils.peer')
const pull = require('pull-stream')
const proto = require('../src/proto')
const promisify = require('promisify-es6')

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
const wait = () => new Promise((resolve) => setTimeout(() => resolve(), 100))
chai.use(dirtyChai)

const discover = (client, ns) => promisify(client._client.discover.bind(client._client))(ns || null)

describe('discovery', () => {
  let client1
  let client2

  before(async () => {
    client1 = await Utils.createRendezvousPeer(require('./client1.id.json'))
    client2 = await Utils.createRendezvousPeer(require('./client2.id.json'))
  })

  it('register client1@hello', async () => {
    client1.register('hello')
    await wait()
  })
  it('discover client1@hello from client2', async () => {
    const res = await discover(client2, 'hello')
    expect(res).to.have.lengthOf(1)
    expect(res[0].id.toB58String()).to.equal(client1.swarm.peerInfo.id.toB58String())
  })
  it('can\'t discover client1@<GLOBAL> from client2', async () => {
    const res = await discover(client2)
    expect(res).to.have.lengthOf(0)
  })
  it('can\'t discover client1@hello from client1', async () => {
    const res = await discover(client1, 'hello')
    expect(res).to.have.lengthOf(0)
  })

  it('register client2@<GLOBAL>', async () => {
    client2.register()
    await wait()
  })
  it('discover client2@<GLOBAL> from client1', async () => {
    const res = await discover(client1)
    expect(res).to.have.lengthOf(1)
    expect(res[0].id.toB58String()).to.equal(client2.swarm.peerInfo.id.toB58String())
  })
  it('can\'t discover client2@hello from client2', async () => {
    const res = await discover(client2, 'hello')
    expect(res).to.have.lengthOf(0)
  })
  it('can\'t discover client2@<GLOBAL> from client2', async () => {
    const res = await discover(client2)
    expect(res).to.have.lengthOf(0)
  })

  it('unregister client1@hello', async () => {
    client1.unregister('hello')
    await wait()
  })
  it('can\'t discover client1@hello from client2 anymore', async () => {
    const res = await discover(client2, 'hello')
    expect(res).to.have.lengthOf(0)
  })

  it('unregister client2@<GLOBAL>', async () => {
    client2.unregister()
    await wait()
  })
  it('can\'t discover client2@<GLOBAL> from client1 anymore', async () => {
    const res = await discover(client1)
    expect(res).to.have.lengthOf(0)
  })
})
