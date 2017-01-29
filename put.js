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
  var digest
  var dest = putStream(cache, key, opts)
  dest.on('digest', function (d) { digest = d })
  pipe(src, dest, function (err) {
    cb(err, digest)
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
      if (!digest) { return cb(new Error('no digest generated')) }
      stream.emit('digest', digest)
      index.insert(cache, key, digest, opts, cb)
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
