var through = require('mississippi').through

module.exports = checkSizeStream
function checkSizeStream (size) {
  var found = 0
  var stream = through(function (chunk, enc, next) {
    found += chunk.length
    next(null, chunk, enc)
  }).on('finish', function () {
    if (size !== found) {
      var err = new Error('stream data size mismatch')
      err.expected = size
      err.found = found
      err.code = 'EBADSIZE'
      stream.emit('error', err)
    }
  })
  return stream
}
