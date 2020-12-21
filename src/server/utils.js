'use strict'

function getExtraParams (alias1, alias2) {
  const params = []

  const flagIndex = process.argv.findIndex((e) => e === alias1 || e === alias2)
  const tmpEndIndex = process.argv.slice(flagIndex + 1).findIndex((e) => e.startsWith('--'))
  const endIndex = tmpEndIndex !== -1 ? tmpEndIndex : process.argv.length - flagIndex - 1

  for (let i = flagIndex + 1; i < flagIndex + endIndex; i++) {
    params.push(process.argv[i + 1])
  }

  return params
}

function getAnnounceAddresses (argv) {
  let announceAddresses = []
  const argvAddr = argv.announceMultiaddrs || argv.am

  if (argvAddr) {
    announceAddresses = [argvAddr]

    const extraParams = getExtraParams('--announceMultiaddrs', '--am')
    extraParams.forEach((p) => announceAddresses.push(p))
  } else if (process.env.ANNOUNCE_MULTIADDRS) {
    announceAddresses = process.env.ANNOUNCE_MULTIADDRS.split(',')
  }

  return announceAddresses
}

function getListenAddresses (argv) {
  let listenAddresses = ['/ip4/127.0.0.1/tcp/15003/ws', '/ip4/127.0.0.1/tcp/8000']
  const argvAddr = argv.listenMultiaddrs || argv.lm

  if (argvAddr) {
    listenAddresses = [argvAddr]

    const extraParams = getExtraParams('--listenMultiaddrs', '--lm')
    extraParams.forEach((p) => listenAddresses.push(p))
  } else if (process.env.LISTEN_MULTIADDRS) {
    listenAddresses = process.env.LISTEN_MULTIADDRS.split(',')
  }

  return listenAddresses
}

module.exports = {
  getAnnounceAddresses,
  getListenAddresses
}
