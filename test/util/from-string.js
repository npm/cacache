'use strict'

const { through } = require('mississippi')

module.exports = fromString
function fromString (str) {
  const stream = through()
  setTimeout(function () {
    stream.write(str)
    stream.end()
  })
  return stream
}
