'use strict'

var index = require('./lib/entry-index')
var pipe = require('mississippi').pipe
var putContent = require('./lib/content/put-stream')
var through = require('mississippi').through
var to = require('mississippi').to

module.exports = putData
function putData (cache, key, data, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  opts = opts || {}
  var src = through()
  var meta
  var dest = putStream(cache, key, opts)
  dest.on('metadata', function (m) { meta = m })
  pipe(src, dest, function (err) {
    cb(err, meta)
  })
  src.write(data, function () {
    src.end()
  })
}

module.exports.stream = putStream
function putStream (cache, key, opts) {
  opts = opts || {}
  var digest
  var contentStream = putContent(cache, opts).on('digest', function (d) {
    digest = d
  })
  var errored = false
  var stream = to(function (chunk, enc, cb) {
    contentStream.write(chunk, enc, cb)
  }, function (cb) {
    contentStream.end(function () {
      index.insert(cache, key, digest, opts, function (err, entry) {
        if (err) { return cb(err) }
        stream.emit('digest', digest)
        stream.emit('metadata', entry)
        cb()
      })
    })
  })
  stream.on('error', function (err) {
    if (errored) { return }
    errored = true
    contentStream.emit('error', err)
  })
  contentStream.on('error', function (err) {
    if (errored) { return }
    errored = true
    stream.emit('error', err)
  })
  return stream
}
