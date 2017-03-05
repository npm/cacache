'use strict'

const Promise = require('bluebird')

const checksumStream = require('checksum-stream')
const contentPath = require('./path')
const crypto = require('crypto')
const fixOwner = require('../util/fix-owner')
const fs = require('graceful-fs')
const moveFile = require('../util/move-file')
const path = require('path')
const pipe = require('mississippi').pipe
const rimraf = Promise.promisify(require('rimraf'))
const through = require('mississippi').through
const to = require('mississippi').to
const uniqueFilename = require('unique-filename')

const writeFileAsync = Promise.promisify(fs.writeFile)

module.exports = write
function write (cache, data, opts) {
  opts = opts || {}
  const digest = crypto.createHash(
    opts.hashAlgorithm || 'sha512'
  ).update(data).digest('hex')
  if (typeof opts.size === 'number' && data.length !== opts.size) {
    return Promise.reject(sizeError(opts.size, data.length))
  }
  if (opts.digest && digest !== opts.digest) {
    return Promise.reject(checksumError(opts.digest, digest))
  }
  return Promise.using(makeTmp(cache, opts), tmp => (
    writeFileAsync(
      tmp.target, data, {flag: 'wx'}
    ).then(() => (
      moveToDestination(tmp, cache, digest, opts)
    ))
  )).then(() => digest)
}

module.exports.stream = writeStream
function writeStream (cache, opts) {
  opts = opts || {}
  const inputStream = through()
  let inputErr = false
  function errCheck () {
    if (inputErr) { throw inputErr }
  }

  let allDone
  const ret = to((c, n, cb) => {
    if (!allDone) {
      allDone = handleContent(inputStream, cache, opts, errCheck)
    }
    inputStream.write(c, n, cb)
  }, cb => {
    inputStream.end(() => {
      if (!allDone) {
        const e = new Error('Input stream was empty')
        e.code = 'ENODATA'
        return ret.emit('error', e)
      }
      allDone.then(digest => {
        digest && ret.emit('digest', digest)
        cb()
      }, e => {
        ret.emit('error', e)
      })
    })
  })
  ret.once('error', e => {
    inputErr = e
  })
  return ret
}

function handleContent (inputStream, cache, opts, errCheck) {
  return Promise.using(makeTmp(cache, opts), tmp => {
    errCheck()
    return pipeToTmp(
      inputStream, cache, tmp.target, opts, errCheck
    ).then(digest => {
      return moveToDestination(
        tmp, cache, digest, opts, errCheck
      ).then(() => digest)
    })
  })
}

function pipeToTmp (inputStream, cache, tmpTarget, opts, errCheck) {
  let digest
  const hashStream = checksumStream({
    digest: opts.digest,
    algorithm: opts.hashAlgorithm || 'sha512',
    size: opts.size
  }).on('digest', d => {
    digest = d
  })

  let outStream = new Promise((resolve, reject) => {
    errCheck()
    resolve(fs.createWriteStream(tmpTarget, {
      flags: 'wx'
    }))
  })
  return Promise.using(outStream, outStream => {
    errCheck()
    return new Promise((resolve, reject) => {
      errCheck()
      inputStream.on('error', reject)
      pipe(inputStream, hashStream, outStream, err => {
        errCheck()
        if (err) {
          rimraf(tmpTarget).then(() => reject(err), reject)
        } else {
          resolve(digest)
        }
      })
    })
  })
}

function makeTmp (cache, opts) {
  const tmpTarget = uniqueFilename(path.join(cache, 'tmp'), opts.tmpPrefix)
  return fixOwner.mkdirfix(
    path.dirname(tmpTarget), opts.uid, opts.gid
  ).then(() => ({
    target: tmpTarget,
    moved: false
  })).disposer(tmp => (!tmp.moved && rimraf(tmp.target)))
}

function moveToDestination (tmp, cache, digest, opts, errCheck) {
  errCheck && errCheck()
  const destination = contentPath(cache, digest, opts.hashAlgorithm)
  const destDir = path.dirname(destination)

  return fixOwner.mkdirfix(
    destDir, opts.uid, opts.gid
  ).then(() => {
    errCheck && errCheck()
    return moveFile(tmp.target, destination)
  }).then(() => {
    errCheck && errCheck()
    tmp.moved = true
    return fixOwner.chownr(destination, opts.uid, opts.gid)
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
