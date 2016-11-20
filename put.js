var dezalgo = require('dezalgo')
var from = require('from2')
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

module.exports.data = putData
function putData (cache, key, filename, data, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  cb = dezalgo(cb)
  opts = Object.create(opts || {})
  opts.filename = filename
  var stream = from(function (size, next) {
    if (data.length <= 0) return next(null, null)
    var chunk = data.slice(0, size)
    data = data.slice(size)
    next(null, chunk)
  })
  return putStream(cache, key, stream, opts, cb)
}

module.exports.stream = putStream
function putStream (cache, key, inputStream, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  cb = inflight('cacache.put.stream: ' + key, cb)
  if (!cb) { return }
  return putContentStream(cache, inputStream, opts, function (err, digest) {
    if (err) { cb(err) }
    index.insert(cache, key, digest, opts, cb)
  })
}

module.exports.metadata = putMetadata
function putMetadata (cache, key, metadata, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  opts = Object.create(opts || {})
  opts.metadata = metadata
  opts.override = true
  console.log('what the fuck tho')
  index.find(cache, key, function (err, info) {
    console.log('ok i read the thing', err, info)
    if (err) { return cb(err) }
    if (!info) { return cb(index.notFoundError(cache, key)) }
    index.insert(cache, key, info.digest, opts, cb)
  })
}
