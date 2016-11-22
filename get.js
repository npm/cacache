var fs = require('graceful-fs')
var index = require('./lib/entry-index')
var pumpify = require('pumpify')
var read = require('./lib/content/read')
var through = require('through2')

module.exports.stream = stream
module.exports.stream.byDigest = read.readStream
function stream (cache, key, opts) {
  var stream = through()
  index.find(cache, key, function (err, data) {
    if (err) { return stream.emit('error', err) }
    if (!data) {
      return stream.emit(
        'error', index.notFoundError(cache, key)
      )
    }
    pumpify(
      read.readStream(cache, data.digest, opts),
      stream
    )
  })
  return stream
}

module.exports.file = file
function file (cache, key, destination, opts, cb) {
  if (!cb) {
    cb = opts
    opts = {}
  }
  pumpify(
    stream(cache, key, opts),
    fs.createWriteStream(destination)
  ).on('error', cb).on('finish', cb)
}

file.byDigest = fileByDigest
function fileByDigest (cache, digest, destination, opts, cb) {
  if (!cb) {
    cb = opts
    opts = {}
  }
  pumpify(
    stream.byDigest(cache, digest, opts),
    fs.createWriteStream(destination)
  ).on('error', cb).on('finish', cb)
}

module.exports.info = info
function info (cache, key, cb) {
  index.find(cache, key, cb)
}
