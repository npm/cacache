'use strict'

const Promise = require('bluebird')

const checksumStream = require('checksum-stream')
const contentPath = require('./path')
const finished = require('mississippi').finished
const fixOwner = require('../util/fix-owner')
const fs = require('graceful-fs')
const hasContent = require('./read').hasContent
const moveFile = require('../util/move-file')
const path = require('path')
const pipe = require('mississippi').pipe
const rimraf = Promise.promisify(require('rimraf'))
const through = require('mississippi').through
const to = require('mississippi').to
const uniqueFilename = require('unique-filename')

module.exports = putStream
function putStream (cache, opts) {
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
  const tmpTarget = uniqueFilename(path.join(cache, 'tmp'), opts.tmpPrefix)
  return (
    opts.digest
    ? hasContent(cache, opts.digest)
    : Promise.resolve(false)
  ).then(exists => {
    errCheck()
    // Fast-path-shortcut this if it's already been written.
    if (exists) {
      return new Promise((resolve, reject) => {
        // Slurp it up if they don't close the stream earlier.
        inputStream.on('data', () => {})
        finished(inputStream, err => {
          err ? reject(err) : resolve(opts.digest)
        })
      })
    } else {
      return fixOwner.mkdirfix(
        path.dirname(tmpTarget), opts.uid, opts.gid
      ).then(() => {
        errCheck()
        const tmpWritten = pipeToTmp(
          inputStream, cache, tmpTarget, opts, errCheck)
        return Promise.using(tmpWritten, digest => {
          errCheck()
          return moveToDestination(
            tmpTarget, cache, digest, opts, errCheck
          ).then(() => digest)
        })
      })
    }
  })
}

function pipeToTmp (inputStream, cache, tmpTarget, opts, errCheck) {
  let digest
  const hashStream = checksumStream({
    digest: opts.digest,
    algorithm: opts.hashAlgorithm,
    size: opts.size
  }).on('digest', d => {
    digest = d
  })

  let outStream = new Promise((resolve, reject) => {
    errCheck()
    resolve(fs.createWriteStream(tmpTarget, {
      flags: 'wx'
    }))
  }).disposer(outStream => new Promise((resolve, reject) => {
    if (!outStream.fd) { resolve() }
    outStream.on('error', reject)
    outStream.on('close', resolve)
  }))
  return Promise.using(outStream, outStream => {
    errCheck()
    return new Promise((resolve, reject) => {
      errCheck()
      inputStream.on('error', reject)
      pipe(inputStream, hashStream, outStream, err => {
        errCheck()
        if (err) {
          reject(err)
        } else {
          resolve(digest)
        }
      })
    })
  }).disposer(() => {
    return rimraf(tmpTarget)
  })
}

function moveToDestination (tmpTarget, cache, digest, opts, errCheck) {
  errCheck()
  const destination = contentPath(cache, digest)
  const destDir = path.dirname(destination)

  return fixOwner.mkdirfix(
    destDir, opts.uid, opts.gid
  ).then(() => {
    errCheck()
    return moveFile(tmpTarget, destination)
  }).then(() => {
    errCheck()
    return fixOwner.chownr(destination, opts.uid, opts.gid)
  })
}
