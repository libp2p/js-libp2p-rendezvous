'use strict'

const Sync = require('./sync')
const RPC = require('./rpc')
const pull = require('pull-stream')

const debug = require('debug')
const log = debug('libp2p:rendezvous:client')
const {parallel, map} = require('async')

class Client {
  constructor (swarm) {
    this.swarm = swarm
    this.store = Sync.create()
    this._dialLock = {}
    this._failedCache = {}
  }

  dial (peer) {
    const id = peer.id.toB58String()
    this.sync()

    // check if we need to dial
    if (this._failedCache[id]) return log('not dialing %s because dial previously failed', id)
    if (this._dialLock[id]) return log('not dialing %s because dial is already in progress', id)
    if (Sync.getPoint(this.store, id)) return log('not dialing %s because peer is already connected', id)

    this._dialLock[id] = true // prevent race
    log('dialing %s', id)

    const cb = (err) => {
      delete this._dialLock[id]

      if (err) {
        log('dialing %s failed: %s', err)
        this._failedCache[id] = true
        return
      }

      log('dialing %s succeeded', id)
      this.sync()
    }

    // do the actual dialing
    this.swarm.dialProtocol(peer, '/p2p/rendezvous/1.0.0', (err, conn) => {
      if (err) return cb(err)

      conn.getPeerInfo((err, pi) => {
        if (err) return cb(err)

        let rpc = RPC(pi, this)

        pull(
          conn,
          rpc,
          conn
        )

        this.store = Sync.addPoint(this.store, id, rpc.rpc)
        cb()
      })
    })
  }

  sync () {
    if (this._syncLock) {
      this._needResync = true
      return
    }
    this._syncLock = true
    log('syncing')
    this.store = Sync.clearPoints(this.store)
    let actions = [] // async rpc calls

    // adds register / unregsiter actions to "actions" array
    /*
    pseudo-code:

    for all store.points as point:
      for all point.registrations as pReg:
        if store.registrations does not contain pReg:
          actions push "unregister pReg @ point"
          delete point.registrations[pReg]
      for all store.registrations as reg:
        if point.registrations does not contain reg:
          actions push "register reg @ point"
          set point.registrations[reg]
    */

    let points = this.store.get('points')
    let registrations = this.store.get('registrations')

    this.store = this.store.set('points', points.reduce((points, point, id) => {
      let regs = point.get('registrations')

      regs = regs.reduce((regs, pReg, pRegId) => {
        if (!registrations.get(pRegId)) {
          log('sync: unregister@%s: %s', id, pRegId)
          actions.push(cb => point.toJS().rpc().unregister(pRegId, pReg.peer.id.toBytes(), cb))
          return regs.delete(pRegId)
        }

        return regs
      }, regs)

      regs = registrations.reduce((regs, reg, regId) => {
        if (!regs.get(regId)) {
          log('sync: register@%s: %s', id, regId)
          actions.push(cb => point.toJS().rpc().register(regId, reg.peer, reg.ttl, cb))
          return regs.set(regId, reg)
        }

        return regs
      }, regs)

      return points.set(id, point.set('registrations', regs))
    }, points))

    log('do sync')
    parallel(actions, (err) => {
      log('done sync')
      delete this._syncLock

      if (err) {
        log(err) // ???
      }

      if (this._needResync) {
        delete this._needResync
        this.sync()
      }
    })
  }

  register (ns, peer, ttl, cb) {
    if (typeof ttl === 'function') {
      cb = ttl
      ttl = 0
    }
    if (typeof peer === 'function') {
      ttl = 0
      cb = peer
      peer = this.swarm.peerInfo
    }

    this.store = this.store.set('registrations', this.store.get('registrations').set(ns, {peer, ttl}))
    this.sync()
  }

  _discover (peerID, ns, limit, cb) {
    if (typeof limit === 'function') {
      cb = limit
      limit = 0
    }
    if (typeof ns === 'function') {
      limit = 0
      cb = ns
      ns = null
    }

    log('discover@%s: %s limit=%s', peerID, ns || '<GLOBAL>', limit)

    let point = this.store.get('points').get(peerID)
    if (!point || !point.get('rpc')().online()) {
      return cb(new Error('Point not connected!'))
    }

    point.get('rpc')().discover(ns, limit, point.get('cookies').get(ns) || Buffer.from(''), (err, res) => {
      if (err) return cb(err)
      this.store.set('points',
        this.store.get('points').set(peerID,
          this.store.get('points').get(peerID).set('cookies',
            this.store.get('points').get(peerID).get('cookies').set(ns, res.cookie))))
      return cb(null, res.peers)
    })
  }

  discover (ns, cb) {
    if (typeof ns === 'function') {
      cb = ns
    }

    let ids = this.store.get('points').toArray().map(p => p[0])

    map(ids,
      (peerID, cb) => this._discover(peerID, ns, 0, (err, res) => err ? cb(null, []) : cb(null, res)),
      (err, res) => err ? cb(err) : cb(null, res.reduce((a, b) => a.concat(b), [])))
  }

  unregister (ns, id) {
    if (!ns) {
      id = this.swarm.peerInfo.id.toBytes()
      ns = null
    }
    if (!id) {
      id = this.swarm.peerInfo.id.toBytes()
    }

    this.store = this.store.set('registrations', this.store.get('registrations').delete(ns))
    this.sync()
  }
}

module.exports = Client
