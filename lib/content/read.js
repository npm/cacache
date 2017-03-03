'use strict'

const Promise = require('bluebird')

const checksumStream = require('checksum-stream')
const contentPath = require('./path')
const fs = require('graceful-fs')
const pipeline = require('mississippi').pipeline

Promise.promisifyAll(fs)

module.exports.readStream = readStream
function readStream (cache, address, opts) {
  opts = opts || {}
  const cpath = contentPath(cache, address, opts.hashAlgorithm || 'sha512')
  return pipeline(
    fs.createReadStream(cpath), checksumStream({
      digest: address,
      algorithm: opts.hashAlgorithm || 'sha512',
      size: opts.size
    })
  )
}

module.exports.hasContent = hasContent
function hasContent (cache, address, algorithm) {
  if (!address) { return Promise.resolve(false) }
  return fs.lstatAsync(
    contentPath(cache, address, algorithm || 'sha512')
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
