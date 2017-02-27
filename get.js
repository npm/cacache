'use strict'

const Promise = require('bluebird')

const index = require('./lib/entry-index')
const finished = Promise.promisify(require('mississippi').finished)
const pipe = require('mississippi').pipe
const read = require('./lib/content/read')
const through = require('mississippi').through

module.exports = function get (cache, key, opts) {
  return getData(false, cache, key, opts)
}
module.exports.byDigest = function getByDigest (cache, digest, opts) {
  return getData(true, cache, digest, opts)
}
function getData (byDigest, cache, key, opts) {
  opts = opts || {}
  const src = (byDigest ? getStream.byDigest : getStream)(cache, key, opts)
  let data = ''
  let meta
  src.on('data', function (d) { data += d })
  src.on('metadata', function (m) { meta = m })
  return finished(src).then(() => ({ data, meta }))
}

module.exports.stream = getStream
module.exports.stream.byDigest = read.readStream
function getStream (cache, key, opts) {
  const stream = through()
  index.find(cache, key).catch(err => {
    stream.emit('error', err)
  }).then(data => {
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
function info (cache, key) {
  return index.find(cache, key)
}
