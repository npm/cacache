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
