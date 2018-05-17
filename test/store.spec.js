/* eslint-env mocha */
const assert = require('assert')

const {
  createStore,
  createNamespace,
  utils,
  addPeer,
  addPeerToNamespace,
  removePeer,
  removePeerFromNamespace,
  clearExpired
} = require('../src/server/store/immutable')

const getNamespaces = utils.getNamespaces
// const setNamespaces = utils.setNamespaces

// Helper for asserting the number of namespaces
const assertNumberOfNamespaces = (store, numberOfNamespaces) => {
  assert.equal(Object.keys(getNamespaces(store).toJSON()).length, numberOfNamespaces)
}

// Helper for asserting the number of peers in a namespace
const assertNumberOfPeersInNamespace = (store, namespace, numberOfPeers) => {
  assert.equal(Object.keys(getNamespaces(store).get(namespace).toJSON()).length, numberOfPeers)
}

// Helper for asserting the number of peers in the global namespace
const assertNumberOfPeers = (store, numberOfPeers) => {
  assert.equal(Object.keys(store.get('global_namespace').toJSON()).length, numberOfPeers)
}

// Helper for asserting which revision we're currently at
const assertRevisionNumber = (store, numberOfRevision) => {
  assert.equal(store.get('_rev'), numberOfRevision)
}

const createPeer = () => {
  return {
    id: 'QmPeerID',
    addrs: ['/ip4/127.0.0.1/tcp/0'],
    ttl: 60,
    received_at: DateNow()
  }
}

const DateNow = () => new Date('2018-05-17T13:00:00.000Z')

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
  it('add duplicate namespace wont clear existing peers', () => {
    const peer = createPeer()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peer)
    store = createNamespace(store, 'my-app')

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 1)
  })
  it('can add peer to global namespace', () => {
    const peer = createPeer()
    let store = createStore()
    store = addPeer(store, peer)

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 0)
    assertNumberOfPeers(store, 1)
  })
  it('can remove peer from global namespace', () => {
    const peer = createPeer()
    let store = createStore()
    store = addPeer(store, peer)
    store = removePeer(store, peer.id)

    assertRevisionNumber(store, 2)
    assertNumberOfNamespaces(store, 0)
    assertNumberOfPeers(store, 0)
  })
  it('can add peer to namespace', () => {
    const peer = createPeer()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peer)

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 1)
  })
  it('can remove peer from namespace', () => {
    const peer = createPeer()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peer)
    store = removePeerFromNamespace(store, 'my-app', peer.id)

    assertRevisionNumber(store, 2)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 0)
  })
  it('gc clears expired peers', () => {
    const peer = createPeer()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peer)
    const dateAfterExpired = new Date('2018-05-17T13:02:00.000Z')
    store = clearExpired(store, 'my-app', dateAfterExpired)

    assertRevisionNumber(store, 2)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 0)
  })
  it('gc leaves non-expired peers in store', () => {
    const peer = createPeer()
    let store = createNamespace(createStore(), 'my-app')
    store = addPeerToNamespace(store, 'my-app', peer)
    const dateBeforeExpired = new Date('2018-05-17T13:00:00.000Z')
    store = clearExpired(store, 'my-app', dateBeforeExpired)

    assertRevisionNumber(store, 1)
    assertNumberOfNamespaces(store, 1)
    assertNumberOfPeersInNamespace(store, 'my-app', 1)
  })
})
