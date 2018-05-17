// Receiving
// Sending
//
//
// Register
// RegisterResponse
//
// Unregister
// Discover
// DiscoverResponse
//
//
//
//
// Need to keep a array of some size
// need to be able to prune the array once every
// have a limit for how many peers i can hold
const { Map } = require('immutable')
const assert = require('assert')

// Helper for checking if a peer has the neccessary properties
const validatePeer = (peer) => {
  if (!peer.id) {
    return new Error('Missing `peer.id`')
  }
  if (!peer.addrs) {
    return new Error('Missing `peer.addrs`')
  }
  if (!peer.ttl) {
    return new Error('Missing `peer.ttl`')
  }
  if (!peer.received_at) {
    return new Error('Missing `peer.received_at`')
  }
}

// Creates the default revision store
const createRevisionStore = () => {
  return Map({_rev: 0, namespaces: Map()})
}

// Helper for incrementing the revision in a store
const incrementRevision = (store) => {
  return store.set('_rev', store.get('_rev') + 1)
}

// Helper for getting the namespace of a store
const getNamespaces = (store) => {
  return store.get('namespaces')
}

// Helper for setting the namespace of a store
const setNamespaces = (store, value) => {
  return store.set('namespaces', value)
}

// Creates a peer table within a store
const createPeerTable = (store, name) => {
  return setNamespaces(store, getNamespaces(store).set(name, Map({})))
}

// Adds a peer to a peer table within a namespace
const addToPeerTable = (store, peerTableName, peerInfo) => {
  const peerErr = validatePeer(peerInfo)
  if (peerErr) {
    throw new Error('Peer was not valid for adding to rendezvous namespace. ' + peerErr)
  }
  // Get a version of the peer table we can modify
  let newPeerTable = getNamespaces(store).get(peerTableName)
  // Add the new peerInfo to the peer table
  newPeerTable = newPeerTable.set(peerInfo.id, Map(peerInfo))
  // We made a modification, lets increment the revision
  store = incrementRevision(store)
  // Return the new store with the new values
  return setNamespaces(store, getNamespaces(store).set(peerTableName, newPeerTable))
}

// Removes a peer from a peer table within a namespace
const removeFromPeerTable = (store, peerTableName, peerID) => {
  // Get a version of the peer table we can modify
  let newPeerTable = getNamespaces(store).get(peerTableName)
  // remove the Peer from it
  newPeerTable = newPeerTable.remove(peerID)
  // We made a modification, lets increment the revision
  store = incrementRevision(store)
  // Return the new store with new values
  return setNamespaces(store, getNamespaces(store).set(peerTableName, newPeerTable))
}

// Helper for asserting the number of namespaces
const assertNumberOfNamespaces = (store, numberOfNamespaces) => {
  assert.equal(Object.keys(getNamespaces(store).toJSON()).length, numberOfNamespaces)
}

// Helper for asserting the number of peers in a namespace
const assertNumberOfPeers = (store, namespace, numberOfPeers) => {
  assert.equal(Object.keys(getNamespaces(store).get(namespace).toJSON()).length, numberOfPeers)
}

// Helper for asserting which revision we're currently at
const assertRevisionNumber = (store, numberOfRevision) => {
  assert.equal(store.get('_rev'), numberOfRevision)
}

// Actual usage
let store = createRevisionStore()
assertRevisionNumber(store, 0)
store = createPeerTable(store, 'my-app')
assertRevisionNumber(store, 0)
const peer = {
  id: 'asd',
  addrs: ['multiaddr'],
  ttl: 60,
  received_at: new Date()
}
store = addToPeerTable(store, 'my-app', peer)

assertRevisionNumber(store, 1)
assertNumberOfNamespaces(store, 1)
assertNumberOfPeers(store, 'my-app', 1)

store = removeFromPeerTable(store, 'my-app', peer.id)

assertRevisionNumber(store, 2)
assertNumberOfNamespaces(store, 1)
assertNumberOfPeers(store, 'my-app', 0)

// namespaces['my-app'] = namespace
// const OnRegister = (namespace, peer) => {
//   // TODO return new copy
//   namespace[peer.id] = peer
// }
// const OnUnregister = (namespace, peer) => {
//   // TODO return new copy
//   namespace[peer.id] = undefined
//   return namespace
// }
// const joinTables = (namespaces) => {
//   const allPeers = []
//   namespaces.forEach((namespace) => {
//     Object.keys(namespace).forEach((id) => {
//       allPeers.push(namespace[id])
//     })
//   })
//   return allPeers
// }
// const OnDiscover = (namespace, limit, cookie) => {
//   if (cookie) {
//   }
//   if (limit) {
//   }
// }
