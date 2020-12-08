'use strict'

const multiaddr = require('multiaddr')

function getAnnounceAddresses (argv) {
  const announceAddr = argv.announceMultiaddrs || argv.am
  const announceAddresses = announceAddr ? [multiaddr(announceAddr).toString()] : []

  if (argv.announceMultiaddrs || argv.am) {
    const flagIndex = process.argv.findIndex((e) => e === '--announceMultiaddrs' || e === '--am')
    const tmpEndIndex = process.argv.slice(flagIndex + 1).findIndex((e) => e.startsWith('--'))
    const endIndex = tmpEndIndex !== -1 ? tmpEndIndex : process.argv.length - flagIndex - 1

    for (let i = flagIndex + 1; i < flagIndex + endIndex; i++) {
      announceAddresses.push(multiaddr(process.argv[i + 1]).toString())
    }
  }

  return announceAddresses
}

module.exports.getAnnounceAddresses = getAnnounceAddresses

function getListenAddresses (argv) {
  const listenAddr = argv.listenMultiaddrs || argv.lm || '/ip4/127.0.0.1/tcp/15002/ws'
  const listenAddresses = [multiaddr(listenAddr).toString()]

  if (argv.listenMultiaddrs || argv.lm) {
    const flagIndex = process.argv.findIndex((e) => e === '--listenMultiaddrs' || e === '--lm')
    const tmpEndIndex = process.argv.slice(flagIndex + 1).findIndex((e) => e.startsWith('--'))
    const endIndex = tmpEndIndex !== -1 ? tmpEndIndex : process.argv.length - flagIndex - 1

    for (let i = flagIndex + 1; i < flagIndex + endIndex; i++) {
      listenAddresses.push(multiaddr(process.argv[i + 1]).toString())
    }
  }

  return listenAddresses
}

module.exports.getListenAddresses = getListenAddresses
