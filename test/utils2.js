'use strict'

const Id = require('peer-id')
const Peer = require('peer-info')
const multiaddr = require('multiaddr')
const { getNamespaces } = require('../src/server/store/immutable').utils
const assert = require('assert')

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

const createPeerRecord = () => new Promise((resolve, reject) => {
  Id.create({bits: 512}, (err, id) => {
    if (err) reject(err)
    const peer = new Peer(id)
    peer.multiaddrs.add(multiaddr('/ip4/127.0.0.1/tcp/0'))
    resolve({
      peer: peer,
      ttl: 60,
      received_at: (module.exports.DateNow || Date.now)()
    })
  })
})

module.exports = {
  assertNumberOfNamespaces,
  assertNumberOfPeersInNamespace,
  assertNumberOfPeers,
  assertRevisionNumber,
  createPeerRecord
}
