var through = require('mississippi').through

module.exports = checkSizeStream
function checkSizeStream (size) {
  var found = 0
  var stream = through(function (chunk, enc, next) {
    found += chunk.length
    next(null, chunk, enc)
  }, function (cb) {
    if (size === found) {
      cb()
    } else {
      var err = new Error('stream data size mismatch')
      err.expected = size
      err.found = found
      err.code = 'EBADSIZE'
      return cb(err)
    }
  })
  return stream
}
