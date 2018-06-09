'use strict'

const { Map } = require('immutable')

const createSyncState = () => {
  return Map({
    _rev: 0,
    registrations: Map(),
    points: Map()
  })
}

// Helper for incrementing the revision in a store
const incrementRevision = (store) => {
  return store.set('_rev', store.get('_rev') + 1)
}

// Add a point together with it's rpc client
const addPoint = (store, id, rpc) => {
  if (getPoint(store, id)) throw new Error('Trying to override ' + id)
  store = incrementRevision(store)
  return store.set('points', store.get('points').set(id, Map({
    registrations: Map(),
    rpc
  })))
}

// Get a point and the current registrations
const getPoint = (store, id) => {
  return store.get(id)
}

// Remove a point
const removePoint = (store, id) => {
  store = incrementRevision(store)
  return store.set('points', store.get('points').delete(id))
}

// Clears offline points
const clearPoints = (store) => {
  return store.get('points').reduce((store, point) => {
    if (!point.rpc().online()) {
      return removePoint(store, point.id)
    }

    return store
  }, store)
}

module.exports = {
  createSyncState,
  addPoint,
  getPoint,
  removePoint,
  clearPoints
}
