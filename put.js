var dezalgo = require('dezalgo')
var fs = require('graceful-fs')
var index = require('./lib/entry-index')
var inflight = require('inflight')
var putContentStream = require('./lib/content/put-stream')

module.exports.file = putFile
function putFile (cache, key, filePath, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  cb = dezalgo(cb)
  try {
    var stream = fs.createReadStream(filePath)
  } catch (e) {
    return cb(e)
  }
  return putStream(cache, key, stream, opts, cb)
}

// TODO - tag cache dir to make sure we're not clobbering?
module.exports.stream = putStream
function putStream (cache, key, inputStream, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  cb = inflight('cacache.put.stream: ' + key, cb)
  if (!cb) { return }
  putContentStream(cache, inputStream, opts, function (err, digest) {
    if (err) { cb(err) }
    index.insert(cache, key, digest, cb)
  })
}
