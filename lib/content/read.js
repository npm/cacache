var checksumStream = require('../util/checksum-stream')
var contentPath = require('./path')
var dezalgo = require('dezalgo')
var fs = require('graceful-fs')
var pumpify = require('pumpify')

module.exports.readStream = readStream
function readStream (cache, address, opts) {
  opts = opts || {}
  var stream = checksumStream(address, opts.hash || 'sha256')
  var cpath = contentPath(cache, address)
  ifContent(cache, address, function (err) {
    if (err) { return stream.emit('error', err) }
    pumpify(fs.createReadStream(cpath), stream)
  })
  return stream
}

module.exports.hasContent = hasContent
function hasContent (cache, address, cb) {
  cb = dezalgo(cb)
  if (!address) { return cb(null, false) }
  fs.lstat(contentPath(cache, address), function (err) {
    if (err && err.code === 'ENOENT') {
      return cb(null, false)
    } else if (err) {
      return cb(err)
    } else {
      return cb(null, true)
    }
  })
}

function ifContent (cache, address, cb) {
  hasContent(cache, address, function (err, exists) {
    if (err) { return cb(err) }
    if (!exists) {
      err = new Error('content not found')
      err.code = 'ENOENT'
      err.cache = cache
      err.digest = address
      return cb(err)
    } else {
      cb(null)
    }
  })
}
