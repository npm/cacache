var fs = require('graceful-fs')
var index = require('./lib/entry-index')
var pipe = require('mississippi').pipe
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
    pipe(
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
  pipe(
    stream(cache, key, opts),
    fs.createWriteStream(destination),
    cb
  )
}

file.byDigest = fileByDigest
function fileByDigest (cache, digest, destination, opts, cb) {
  if (!cb) {
    cb = opts
    opts = {}
  }
  pipe(
    stream.byDigest(cache, digest, opts),
    fs.createWriteStream(destination),
    cb
  )
}

module.exports.info = info
function info (cache, key, cb) {
  index.find(cache, key, cb)
}
