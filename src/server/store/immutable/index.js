'use strict'

const { Map } = require('immutable')

// Helper for checking if a peer has the neccessary properties
const validatePeerRecord = (peerRecord) => {
  // Should validate that this is a PeerInfo instead
  if (!peerRecord.peer.id.toB58String) {
    return new Error('Missing `peerRecord.peer.id._id`')
  }
  if (!peerRecord.peer.multiaddrs) {
    return new Error('Missing `peerRecord.addrs`')
  }
  if (!peerRecord.ttl) {
    return new Error('Missing `peerRecord.ttl`')
  }
  if (!peerRecord.received_at) {
    return new Error('Missing `peerRecord.received_at`')
  }
}

// Creates the default revision store
const createRevisionStore = () => {
  return Map({
    _rev: 0,
    global_namespace: Map(),
    namespaces: Map()
  })
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
const createNamespace = (store, name) => {
  // Check if namespace already exists
  if (getNamespaces(store).get(name)) {
    return store
  } else {
    // Didn't exists, let's create it with a empty Map
    return setNamespaces(store, getNamespaces(store).set(name, Map({})))
  }
}

// Adds a peer to a peer table within a namespace
const addPeerToNamespace = (store, peerTableName, peerRecord) => {
  const peerErr = validatePeerRecord(peerRecord)
  if (peerErr) {
    throw new Error('Peer was not valid for adding to rendezvous namespace. ' + peerErr)
  }
  // Get a version of the peer table we can modify
  let newPeerTable = getNamespaces(store).get(peerTableName)
  // Add the new peerRecord to the peer table
  newPeerTable = newPeerTable.set(peerRecord.peer.id.toB58String(), Map(peerRecord))
  // We made a modification, lets increment the revision
  store = incrementRevision(store)
  // Return the new store with the new values
  return setNamespaces(store, getNamespaces(store).set(peerTableName, newPeerTable))
}

// Add a peer to the global namespace
const addPeer = (store, peerRecord) => {
  const peerErr = validatePeerRecord(peerRecord)
  if (peerErr) {
    throw new Error('Peer was not valid for adding to rendezvous namespace. ' + peerErr)
  }
  // We made a modification, lets increment the revision
  store = incrementRevision(store)
  // Return the new store with the new values
  return store.set('global_namespace', store.get('global_namespace').set(peerRecord.peer.id.toB58String(), Map(peerRecord)))
}

// Removes a peer from a peer table within a namespace
const removePeerFromNamespace = (store, peerTableName, peerID) => {
  // Get a version of the peer table we can modify
  let newPeerTable = getNamespaces(store).get(peerTableName)
  // remove the Peer from it
  newPeerTable = newPeerTable.remove(peerID)
  // We made a modification, lets increment the revision
  store = incrementRevision(store)
  // Return the new store with new values
  return setNamespaces(store, getNamespaces(store).set(peerTableName, newPeerTable))
}

// Removes a peer from the global namespace
const removePeer = (store, peerID) => {
  // We made a modification, lets increment the revision
  store = incrementRevision(store)
  // Return the new store with new values
  return store.set('global_namespace', store.get('global_namespace').delete(peerID))
}

// Removes a namespace
const removeNamespace = (store, peerTableName) => {
  // We made a modification, lets increment the revision
  store = incrementRevision(store)
  // Return the new store with new values
  return setNamespaces(store, getNamespaces(store).delete(peerTableName))
}

// Checks all the ttls and removes peers that are expired
const clearExpiredFromNamespace = (store, peerTableName, currentTime) => {
  // Get the peer table
  const peerTable = getNamespaces(store).get(peerTableName)
  // Go through all peers
  const newStore = peerTable.reduce((accStore, v) => {
    const expiresAt = new Date(v.get('received_at'))

    // Add TTL seconds to date to get when it should expire
    expiresAt.setSeconds(expiresAt.getSeconds() + v.get('ttl'))

    // Get amount of seconds diff with current time
    const diffInSeconds = (expiresAt - currentTime) / 1000

    // If it's less than zero, peer has expired and we should remove it
    if (diffInSeconds < 0) {
      return removePeerFromNamespace(accStore, peerTableName, v.get('peer').id.toB58String())
    }
    return accStore
  }, store)
  // Return the new store with new values
  return newStore
}

// Checks all the ttls and removes peers that are expired
const clearExpiredFromGlobalNamespace = (store, currentTime) => {
  // Go through all peers
  const newStore = store.get('global_namespace').reduce((accStore, v) => {
    const expiresAt = new Date(v.get('received_at'))

    // Add TTL seconds to date to get when it should expire
    expiresAt.setSeconds(expiresAt.getSeconds() + v.get('ttl'))

    // Get amount of seconds diff with current time
    const diffInSeconds = (expiresAt - currentTime) / 1000

    // If it's less than zero, peer has expired and we should remove it
    if (diffInSeconds < 0) {
      return removePeer(accStore, v.get('id'))
    }
    return accStore
  }, store)
  // Return the new store with new values
  return newStore
}

const clearExpired = (store, peerTableName, currentTime) => {
  const newStore = clearExpiredFromGlobalNamespace(store, currentTime)
  return clearExpiredFromNamespace(newStore, peerTableName, currentTime)
}

const clearEmptyNamespaces = (store) => {
  return getNamespaces(store).reduce((store, ns, id) => {
    if (!ns.size) {
      return removeNamespace(store, id)
    }

    return store
  }, store)
}

module.exports = {
  createStore: createRevisionStore,
  createNamespace,
  addPeer,
  addPeerToNamespace,
  removePeer,
  removePeerFromNamespace,
  removeNamespace,
  clearEmptyNamespaces,
  clearExpired,
  utils: {
    getNamespaces,
    setNamespaces
  }
}
