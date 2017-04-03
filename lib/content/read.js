'use strict'

const BB = require('bluebird')

const contentPath = require('./path')
const fs = require('graceful-fs')
const PassThrough = require('stream').PassThrough
const pipe = BB.promisify(require('mississippi').pipe)
const ssri = require('ssri')

BB.promisifyAll(fs)

module.exports = read
function read (cache, integrity, opts) {
  opts = opts || {}
  return pickContentSri(cache, integrity).then(sri => {
    const cpath = contentPath(cache, sri)
    return fs.readFileAsync(cpath, null).then(data => {
      if (typeof opts.size === 'number' && opts.size !== data.length) {
        throw sizeError(opts.size, data.length)
      } else if (ssri.checkData(data, sri)) {
        return data
      } else {
        throw checksumError(sri, null)
      }
    })
  })
}

module.exports.stream = readStream
module.exports.readStream = readStream
function readStream (cache, integrity, opts) {
  opts = opts || {}
  const stream = new PassThrough()
  pickContentSri(
    cache, integrity
  ).then(sri => {
    return pipe(
      fs.createReadStream(contentPath(cache, sri)),
      ssri.integrityStream({
        integrity: sri,
        size: opts.size
      }),
      stream
    )
  }).catch(err => {
    stream.emit('error', err)
  })
  return stream
}

module.exports.hasContent = hasContent
function hasContent (cache, integrity) {
  if (!integrity) { return BB.resolve(false) }
  return pickContentSri(cache, integrity, true)
  .catch({code: 'ENOENT'}, () => false)
  .catch({code: 'EPERM'}, err => {
    if (process.platform !== 'win32') {
      throw err
    } else {
      return false
    }
  }).then(sri => sri || false)
}

module.exports._pickContentSri = pickContentSri
function pickContentSri (cache, integrity, checkFs) {
  const sri = ssri.parse(integrity)
  // If `integrity` has multiple entries, pick the first digest
  // with available local data.
  const algo = sri.pickAlgorithm()
  const digests = sri[algo]
  if (digests.length <= 1) {
    const cpath = contentPath(cache, digests[0])
    if (checkFs) {
      return fs.lstatAsync(cpath).then(() => digests[0])
    } else {
      return BB.resolve(digests[0])
    }
  } else {
    return BB.any(sri[sri.pickAlgorithm()].map(meta => {
      return pickContentSri(cache, meta, true)
    }))
  }
}

function sizeError (expected, found) {
  var err = new Error('stream data size mismatch')
  err.expected = expected
  err.found = found
  err.code = 'EBADSIZE'
  return err
}

function checksumError (sri, path) {
  var err = new Error(`Checksum failed for ${sri} (${path})`)
  err.code = 'EBADCHECKSUM'
  err.sri = sri
  err.path = path
  return err
}
