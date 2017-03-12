'use strict'

const BB = require('bluebird')

const checksumStream = require('checksum-stream')
const contentPath = require('./path')
const crypto = require('crypto')
const fs = require('graceful-fs')
const pipeline = require('mississippi').pipeline

BB.promisifyAll(fs)

module.exports = read
function read (cache, address, opts) {
  opts = opts || {}
  const algo = opts.hashAlgorithm || 'sha512'
  const cpath = contentPath(cache, address, algo)
  return fs.readFileAsync(cpath, null).then(data => {
    const digest = crypto.createHash(algo).update(data).digest('hex')
    if (typeof opts.size === 'number' && opts.size !== data.length) {
      throw sizeError(opts.size, data.length)
    } else if (digest !== address) {
      throw checksumError(address, digest)
    } else {
      return data
    }
  })
}

module.exports.stream = readStream
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
  if (!address) { return BB.resolve(false) }
  return fs.lstatAsync(
    contentPath(cache, address, algorithm || 'sha512')
  ).then(() => true).catch(err => {
    if (err && err.code === 'ENOENT') {
      return BB.resolve(false)
    } else if (err && process.platform === 'win32' && err.code === 'EPERM') {
      return BB.resolve(false)
    } else {
      throw err
    }
  })
}

function sizeError (expected, found) {
  var err = new Error('stream data size mismatch')
  err.expected = expected
  err.found = found
  err.code = 'EBADSIZE'
  return err
}

function checksumError (expected, found) {
  var err = new Error('checksum failed')
  err.code = 'EBADCHECKSUM'
  err.expected = expected
  err.found = found
  return err
}
