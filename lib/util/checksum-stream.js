var crypto = require('crypto')
var through = require('mississippi').through

module.exports = checksumStream
function checksumStream (digest, algorithm) {
  var hash = crypto.createHash(algorithm || 'sha256')
  var stream = through(function (chunk, enc, cb) {
    hash.update(chunk, enc)
    cb(null, chunk)
  }).on('finish', function () {
    var streamDigest = hash.digest('hex')
    if (digest && streamDigest !== digest) {
      var err = new Error('checksum failed')
      err.code = 'EBADCHECKSUM'
      err.expected = digest
      err.found = streamDigest
      return stream.emit('error', err)
    } else {
      stream.emit('digest', streamDigest)
    }
  })
  return stream
}
