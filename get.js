'use strict'

var index = require('./lib/entry-index')
var finished = require('mississippi').finished
var pipe = require('mississippi').pipe
var read = require('./lib/content/read')
var through = require('mississippi').through

module.exports = function get (cache, key, opts, cb) {
  return getData(false, cache, key, opts, cb)
}
module.exports.byDigest = function getByDigest (cache, digest, opts, cb) {
  return getData(true, cache, digest, opts, cb)
}
function getData (byDigest, cache, key, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  opts = opts || {}
  var src = (byDigest ? getStream.byDigest : getStream)(cache, key, opts)
  var data = ''
  var meta
  src.on('data', function (d) { data += d })
  src.on('metadata', function (m) { meta = m })
  finished(src, function (err) {
    cb(err, data, meta)
  })
}

module.exports.stream = getStream
module.exports.stream.byDigest = read.readStream
function getStream (cache, key, opts) {
  var stream = through()
  index.find(cache, key, function (err, data) {
    if (err) { return stream.emit('error', err) }
    if (!data) {
      return stream.emit(
        'error', index.notFoundError(cache, key)
      )
    }
    stream.emit('metadata', data)
    stream.on('newListener', function (ev, cb) {
      ev === 'metadata' && cb(data)
    })
    pipe(
      read.readStream(cache, data.digest, opts),
      stream
    )
  })
  return stream
}

module.exports.info = info
function info (cache, key, cb) {
  index.find(cache, key, cb)
}
