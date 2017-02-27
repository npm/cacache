'use strict'

const Promise = require('bluebird')

const index = require('./lib/entry-index')
const pipe = Promise.promisify(require('mississippi').pipe)
const putContent = require('./lib/content/put-stream')
const through = require('mississippi').through
const to = require('mississippi').to

module.exports = putData
function putData (cache, key, data, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  opts = opts || {}
  const src = through()
  let meta
  const dest = putStream(cache, key, opts)
  dest.on('metadata', function (m) { meta = m })
  const ret = pipe(src, dest).then(() => meta)
  src.write(data, function () {
    src.end()
  })
  return ret
}

module.exports.stream = putStream
function putStream (cache, key, opts) {
  opts = opts || {}
  let digest
  const contentStream = putContent(cache, opts).on('digest', function (d) {
    digest = d
  })
  let errored = false
  const stream = to(function (chunk, enc, cb) {
    contentStream.write(chunk, enc, cb)
  }, function (cb) {
    contentStream.end(function () {
      index.insert(cache, key, digest, opts).then(entry => {
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
