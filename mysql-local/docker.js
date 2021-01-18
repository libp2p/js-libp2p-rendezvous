'use strict'

const delay = require('delay')
const execa = require('execa')
const pWaitFor = require('p-wait-for')

module.exports = {
  start: async (port = 3306, pw = 'test-secret-pw', database = 'libp2p_rendezvous_db') => {
    const procResult = execa.commandSync(`docker run -p 3306:${port} -e MYSQL_ROOT_PASSWORD=${pw} -e MYSQL_DATABASE=${database} -d mysql:8 --default-authentication-plugin=mysql_native_password`, {
      all: true
    })
    const containerId = procResult.stdout

    console.log(`wait for docker container ${containerId} to be ready`)

    await pWaitFor(() => {
      const procCheck = execa.commandSync(`docker logs ${containerId}`)
      const logs = procCheck.stdout + procCheck.stderr // Docker/MySQL sends to the stderr the ready for connections...

      return logs.includes('ready for connections')
    }, {
      interval: 5000
    })
    // Some more time waiting to properly setup the container
    await delay(12e3)

    return containerId
  },
  stop: (containerId) => {
    console.log('docker container is stopping')
    execa.commandSync(`docker stop ${containerId}`)
  }
}