'use strict'

const debug = require('debug')
const log = debug('libp2p:rendezvous:queue')

class AsyncQueue {
  constructor () {
    this.tasks = []
    this.taskIds = {}
    this.triggered = false
  }
  add (name, fnc) {
    if (this.taskIds[name]) return
    log('queueing %s', name)
    this.taskIds[name] = true
    this.tasks.push(fnc)
    this.trigger()
  }
  trigger () {
    if (this.triggered) return
    this.triggered = true
    setTimeout(() => {
      log('exec')
      this.tasks.forEach(f => f())
      this.tasks = []
      this.taskIds = {}
      this.triggered = false
      log('exec done')
    }, 100).unref()
  }
}

module.exports = AsyncQueue
