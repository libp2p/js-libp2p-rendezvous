'use strict'

function median (values) {
  if (values.length === 0) {
    return 0
  }

  values.sort((a, b) => a - b)

  var half = Math.floor(values.length / 2)

  if (values.length % 2) {
    return values[half]
  }

  return (values[half - 1] + values[half]) / 2.0
}

module.exports = {
  median
}
