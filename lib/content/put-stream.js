'use strict'

const Promise = require('bluebird')

const checksumStream = require('checksum-stream')
const contentPath = require('./path')
const duplex = require('mississippi').duplex
const finished = require('mississippi').finished
const fixOwner = require('../util/fix-owner')
const fs = require('graceful-fs')
const hasContent = require('./read').hasContent
const moveFile = require('../util/move-file')
const path = require('path')
const pipeline = require('mississippi').pipeline
const rimraf = Promise.promisify(require('rimraf'))
const to = require('mississippi').to
const uniqueFilename = require('unique-filename')

const closeAsync = Promise.promisify(fs.close)

module.exports = putStream
function putStream (cache, opts) {
  opts = opts || {}
  const tmpTarget = uniqueFilename(path.join(cache, 'tmp'), opts.tmpPrefix)

  const inputStream = duplex()

  hasContent(cache, opts.digest).then(exists => {
    // Fast-path-shortcut this if it's already been written.
    if (exists) {
      inputStream.emit('digest', opts.digest)
      // Slurp it up if they don't close the stream earlier.
      inputStream.setWritable(to((c, en, cb) => cb()))
      return
    }
    return fixOwner.mkdirfix(
      path.dirname(tmpTarget), opts.uid, opts.gid
    ).then(() => (
      Promise.using(pipeToTmp(inputStream, cache, tmpTarget, opts), digest => (
        moveToDestination(tmpTarget, cache, digest, opts).then(() => (
          inputStream.emit('digest', digest)
        ))
      ))
    ))
  }).catch(err => (
    inputStream.emit('error', err)
  ))

  return inputStream
}

function pipeToTmp (inputStream, cache, tmpTarget, opts) {
  let digest
  let size
  const hashStream = checksumStream({
    digest: opts.digest,
    algorithm: opts.hashAlgorithm,
    size: opts.size
  }).on('digest', d => {
    digest = d
  }).on('size', s => {
    size = s
  })

  const outStream = fs.createWriteStream(tmpTarget, {
    flags: 'w',
    autoClose: false
  })

  let finishStream
  return new Promise((resolve, reject) => {
    const combined = pipeline(hashStream, to((c, en, cb) => {
      outStream.write(c, en, cb)
    }, cb => {
      finishStream = cb
      outStream.end()
    }))
    inputStream.setWritable(combined)
    finished(outStream, err => {
      // Make damn sure the fd is closed before we continue
      (outStream.fd ? closeAsync(outStream.fd) : Promise.resolve())
      .then(() => {
        if (!size) {
          const e = new Error('Input stream was empty')
          e.code = 'ENODATA'
          reject(e)
        } else if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }).then(() => digest).disposer(() => (
    rimraf(tmpTarget).then(() => finishStream && finishStream())
  ))
}

function moveToDestination (tmpTarget, cache, digest, opts) {
  const destination = contentPath(cache, digest)
  const destDir = path.dirname(destination)

  return fixOwner.mkdirfix(
    destDir, opts.uid, opts.gid
  ).then(() => (
    new Promise((resolve, reject) => {
      moveFile(tmpTarget, destination, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  )).then(() => (
    fixOwner.chownr(destination, opts.uid, opts.gid)
  ))
}
