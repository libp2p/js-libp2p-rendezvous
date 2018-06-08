'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous:state')
const {each, waterfall} = require('async')
const noop = () => {}
const once = require('once')

class State {
  constructor (main, id) {
    this.rpc = main.rpc
    this.myId = id
    this.byId = main.rpcById
    this.cleanPeers = main._cleanPeers.bind(main)
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
  unregister (ns) {
    if (!this.regById[ns]) throw new Error('NS ' + JSON.stringify(ns) + ' not registered!') // TODO: should this throw?
    delete this.regById[ns]
    this.registrations = this.registrations.filter(r => r.ns !== ns)
    this.syncState(noop)
  }
  rpcReg (rpc, set) {
    if (set) {
      rpc.registrations[this.myId] = set
    }
    if (!rpc.registrations[this.myId]) rpc.registrations[this.myId] = []
    return rpc.registrations[this.myId]
  }
  syncState (cb) {
    if (!cb) cb = noop
    cb = once(cb)
    this.cleanPeers()
    log('syncing state with %s peer(s)', this.rpc.length)
    each(this.rpc, (rpc, cb) => {
      let toRegister = this.registrations.filter(r => this.rpcReg(rpc).indexOf(r.ns) === -1)
      let toUnregister = this.rpcReg(rpc).filter(r => !this.regById[r])
      waterfall([
        cb => each(toRegister, (reg, cb) => {
          log('sync@%s: register %s', rpc.id, reg.ns)
          rpc.register(reg.ns, reg.peer, reg.ttl, cb)
        }, e => cb(e)),
        cb => each(toUnregister, (regId, cb) => {
          log('sync@%s: unregister', rpc.id, regId)
          rpc.unregister(regId, Buffer.from(this.myId, 'hex')) // TODO: shouldn't this be async?
          cb()
        }, e => cb(e)),
        cb => {
          this.rpcReg(rpc, this.rpcReg(rpc).filter(r => toUnregister.indexOf(r) === -1).concat(toRegister.map(r => r.ns)))
          cb()
        }
      ], cb)
    }, cb)
  }
}

module.exports = State
