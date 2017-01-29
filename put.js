var index = require('./lib/entry-index')
var putContent = require('./lib/content/put-stream')
var to = require('mississippi').to

module.exports.stream = putStream
function putStream (cache, key, opts) {
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
