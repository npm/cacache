'use strict'

const Promise = require('bluebird')

const checksumStream = require('checksum-stream')
const contentPath = require('./path')
const fs = require('graceful-fs')
const pipe = require('mississippi').pipe

Promise.promisifyAll(fs)

module.exports.readStream = readStream
function readStream (cache, address, opts) {
  opts = opts || {}
  const stream = checksumStream({
    digest: address,
    algorithm: opts.hashAlgorithm || 'sha512'
  })
  const cpath = contentPath(cache, address)
  hasContent(cache, address).then(exists => {
    if (!exists) {
      const err = new Error('content not found')
      err.code = 'ENOENT'
      err.cache = cache
      err.digest = address
      return stream.emit('error', err)
    } else {
      pipe(fs.createReadStream(cpath), stream)
    }
  }).catch(err => {
    stream.emit('error', err)
  })
  return stream
}

module.exports.hasContent = hasContent
function hasContent (cache, address, cb) {
  if (!address) { return Promise.resolve(false) }
  return fs.lstatAsync(
    contentPath(cache, address)
  ).then(() => true).catch(err => {
    if (err && err.code === 'ENOENT') {
      return Promise.resolve(false)
    } else if (err && process.platform === 'win32' && err.code === 'EPERM') {
      return Promise.resolve(false)
    } else {
      throw err
    }
  })
}
