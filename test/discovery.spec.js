'use strict'

/* eslint-env mocha */

const {parallel} = require('async')
const Utils = require('./utils')
const pull = require('pull-stream')
const proto = require('../src/proto')

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

describe('discovery', () => {
  let client1
  let client2
  before(async () => {
    client1 = await Utils.createRendezvousPeer(require('./client1.id.json'))
    client2 = await Utils.createRendezvousPeer(require('./client2.id.json'))
  })

  it('register', () => {
    client1.register('hello')
  })
})
