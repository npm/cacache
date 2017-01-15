var index = require('./lib/entry-index')
var inflight = require('inflight')
var putContentStream = require('./lib/content/put-stream')

module.exports.stream = putStream
function putStream (cache, key, inputStream, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  cb = inflight('cacache.put.stream: ' + key, cb)
  if (!cb) { return }
  return putContentStream(cache, inputStream, opts, function (err, digest) {
    if (err) { return cb(err) }
    index.insert(cache, key, digest, opts, function (err) {
      cb(err, digest)
    })
  })
}
