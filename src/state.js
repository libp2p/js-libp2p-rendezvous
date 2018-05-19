'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous:state')
const {each, waterfall} = require('async')
const noop = () => {}
const once = require('once')

class State { // TODO: add multiple peer-id logic (maybe use different states per id?)
  constructor (main) {
    this.rpc = main.rpc
    this.byId = main.rpcById
    this.registrations = []
    this.regById = {}
  }
  register (ns, peer, ttl, cb) {
    if (this.regById[ns]) return cb(new Error('NS ' + JSON.stringify(ns) + ' already registered!'))
    log('register %s', ns)
    this.regById[ns] = {ns, peer, ttl}
    this.registrations.push(this.regById[ns])
    this.syncState(cb)
  }
  unregister (ns /*, id */) {
    delete this.regById[ns]
    this.registrations = this.registrations.filter(r => r.ns !== ns)
    this.syncState(noop)
  }
  manage (rpc) {
    this.rpc.push(rpc)
    this.byId[rpc.id] = rpc

    rpc.cursors = {}
    rpc.registrations = []

    log('manage peer %s', rpc.id)
  }
  syncState (cb) {
    if (!cb) cb = noop
    cb = once(cb)
    this.rpc = this.rpc.filter(peer => {
      if (peer.online) return true
      log('drop disconnected peer %s', peer.id)
      delete this.byId[peer.id]
      return false
    })
    log('syncing state with %s peer(s)', this.rpc.length)
    each(this.rpc, (rpc, cb) => {
      let toRegister = this.registrations.filter(r => rpc.registrations.indexOf(r.ns) === -1)
      let toUnregister = rpc.registrations.filter(r => !this.regById[r])
      waterfall([
        cb => each(toRegister, (reg, cb) => {
          log('sync@%s: register %s', rpc.id, reg.ns)
          rpc.register(reg.ns, reg.peer, reg.ttl, cb)
        }, e => cb(e)),
        cb => each(toUnregister, (regId, cb) => {
          log('sync@%s: unregister', rpc.id, regId)
          delete rpc.cursors[regId]
          rpc.register(regId, cb)
        }, e => cb(e))
      ], cb)
    }, cb)
  }
}

module.exports = State
