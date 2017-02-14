'use strict'

var through = require('mississippi').through

module.exports = checkSizeStream
function checkSizeStream (size) {
  if (size == null) { throw new Error('size is required') }
  var found = 0
  var stream = through(function (chunk, enc, next) {
    found += chunk.length
    next(null, chunk, enc)
  }, function (cb) {
    cb(size === found ? null : sizeError(size, found))
  })
  return stream
}

function sizeError (expected, found) {
  var err = new Error('stream data size mismatch')
  err.expected = expected
  err.found = found
  err.code = 'EBADSIZE'
  return err
}
