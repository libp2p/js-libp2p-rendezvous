const { Map } = require('immutable')

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
  // Check if namespace already exists
  if (getNamespaces(store).get(name)) {
    return store
  } else {
    // Didn't exists, let's create it with a empty Map
    return setNamespaces(store, getNamespaces(store).set(name, Map({})))
  }
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

// Checks all the ttls and removes peers that are expired
const clearExpired = (store, peerTableName, currentTime) => {
  // Get the peer table
  const peerTable = getNamespaces(store).get(peerTableName)
  // Go through all peers
  const newStore = peerTable.reduce((accStore, v) => {
    const receivedAt = new Date(v.get('received_at'))
    const expiresAt = new Date(v.get('received_at'))

    // Add TTL seconds to date to get when it should expire
    expiresAt.setSeconds(expiresAt.getSeconds() + v.get('ttl'))

    // Get amount of seconds diff with current time
    const diffInSeconds = (expiresAt - currentTime) / 1000

    // If it's less than zero, peer has expired and we should remove it
    if (diffInSeconds < 0) {
      return removeFromPeerTable(accStore, peerTableName, v.get('id'))
    }
    return accStore
  }, store)
  // Return the new store with new values
  return newStore
}

module.exports = {
  createStore: createRevisionStore,
  createNamespace: createPeerTable,
  addPeer: addToPeerTable,
  removePeer: removeFromPeerTable,
  clearExpired: clearExpired,
  utils: {
    getNamespaces,
    setNamespaces
  }
}
