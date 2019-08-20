'use strict'

const through = require('mississippi').through

module.exports = fromString
function fromString (str) {
  const stream = through()
  setTimeout(function () {
    stream.write(str)
    stream.end()
  })
  return stream
}
