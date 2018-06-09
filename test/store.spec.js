'use strict'

/* eslint-env mocha */

const assert = require('assert')
const PeerInfo = require('peer-info')
const PeerID = require('peer-id')
const multiaddr = require('multiaddr')

const {
  createStore,
  createNamespace,
  utils,
  addPeer,
  addPeerToNamespace,
  removePeer,
  removePeerFromNamespace,
  clearExpired,
  clearEmptyNamespaces,
  clearEmpty
} = require('../src/server/store/immutable')

const Utils = require('./utils.store')

const {
  assertNumberOfNamespaces,
  assertNumberOfPeersInNamespace,
  assertNumberOfPeers,
  assertRevisionNumber,
  createPeerRecord
} = Utils

const DateNow = Utils.DateNow = () => new Date('2018-05-17T13:00:00.000Z') // mock date

describe('immutable store', () => {
  it('starts with no revisions', () => {
    const store = createStore()

    assertRevisionNumber(store, 0)
    assertNumberOfNamespaces(store, 0)
  })

  it('add namespace', () => {
    const store = createNamespace(createStore(), 'my-app')

    assertRevisionNumber(store, 0)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 0)
  })

  it('add multiple namespaces', () => {
    let store = createStore()
    store = createNamespace(store, 'my-app-1')
    store = createNamespace(store, 'my-app-2')
    store = createNamespace(store, 'my-app-3')

    assertRevisionNumber(store, 0)
    assertNumberOfNamespaces(store, 3)
  })

  it('add duplicated namespace', () => {
    let store = createStore()
    store = createNamespace(store, 'my-app')
    store = createNamespace(store, 'my-app')

    assertRevisionNumber(store, 0)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 0)
  })

  it('add duplicate namespace wont clear existing peers', async () => {
    const peerRecord = await createPeerRecord()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peerRecord)
    store = createNamespace(store, 'my-app')

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 1)
  })

  it('can add peer to global namespace', async () => {
    const peerRecord = await createPeerRecord()
    let store = createStore()
    store = addPeer(store, peerRecord)

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 0)
    assertNumberOfPeers(store, 1)
  })

  it('can remove peer from global namespace', async () => {
    const peerRecord = await createPeerRecord()
    let store = createStore()
    store = addPeer(store, peerRecord)
    store = removePeer(store, peerRecord.peer.id.toB58String())

    assertRevisionNumber(store, 2)
    assertNumberOfNamespaces(store, 0)
    assertNumberOfPeers(store, 0)
  })

  it('can add peer to namespace', async () => {
    const peerRecord = await createPeerRecord()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peerRecord)

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 1)
  })

  it('can remove peer from namespace', async () => {
    const peerRecord = await createPeerRecord()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peerRecord)
    store = removePeerFromNamespace(store, 'my-app', peerRecord.peer.id.toB58String())

    assertRevisionNumber(store, 2)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 0)
  })

  it('gc clears expired peers', async () => {
    const peerRecord = await createPeerRecord()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peerRecord)
    const dateAfterExpired = new Date('2018-05-17T13:02:00.000Z')
    store = clearExpired(store, 'my-app', dateAfterExpired)

    assertRevisionNumber(store, 2)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 0)
    assertNumberOfPeers(store, 0)
  })

  it('gc leaves non-expired peers in store', async () => {
    const peerRecord = await createPeerRecord()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peerRecord)
    const dateBeforeExpired = new Date('2018-05-17T13:00:00.000Z')
    store = clearExpired(store, 'my-app', dateBeforeExpired)

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 1)
    // console.log(JSON.stringify(store.toJSON(), null, 2))
  })

  it('gc clears empty namespace', async () => {
    const peerRecord = await createPeerRecord()
    let store = createNamespace(createNamespace(createStore(), 'my-app'), 'my-app-2')
    store = addPeerToNamespace(store, 'my-app', peerRecord)
    store = clearEmptyNamespaces(store)

    assertRevisionNumber(store, 2)
    assertNumberOfNamespaces(store, 1)
  })
})
