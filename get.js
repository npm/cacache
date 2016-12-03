var fs = require('graceful-fs')
var index = require('./lib/entry-index')
var pipeline = require('mississippi').pipeline
var read = require('./lib/content/read')
var through = require('mississippi').through

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
    pipeline(
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
  pipeline(
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
  pipeline(
    stream.byDigest(cache, digest, opts),
    fs.createWriteStream(destination)
  ).on('error', cb).on('finish', cb)
}

module.exports.info = info
function info (cache, key, cb) {
  index.find(cache, key, cb)
}
