'use strict'

const util = require('util')

const contentPath = require('./path')
const fixOwner = require('../util/fix-owner')
const fs = require('graceful-fs')
const moveFile = require('../util/move-file')
const { PassThrough } = require('stream')
const path = require('path')
const pipe = util.promisify(require('mississippi').pipe)
const rimraf = util.promisify(require('rimraf'))
const ssri = require('ssri')
const { to } = require('mississippi')
const uniqueFilename = require('unique-filename')

const writeFile = util.promisify(fs.writeFile)

module.exports = write

function write (cache, data, opts) {
  opts = opts || {}
  if (opts.algorithms && opts.algorithms.length > 1) {
    throw new Error('opts.algorithms only supports a single algorithm for now')
  }
  if (typeof opts.size === 'number' && data.length !== opts.size) {
    return Promise.reject(sizeError(opts.size, data.length))
  }
  const sri = ssri.fromData(data, {
    algorithms: opts.algorithms
  })
  if (opts.integrity && !ssri.checkData(data, opts.integrity, opts)) {
    return Promise.reject(checksumError(opts.integrity, sri))
  }
  return makeTmp(cache, opts)
    .then((tmp) => {
      return writeFile(tmp.target, data, { flag: 'wx' })
        .then(() => moveToDestination(tmp, cache, sri, opts))
        .then((result) => makeTmpDisposer(tmp, result))
        .catch((err) => makeTmpDisposer(tmp, err, true))
    })
    .then(() => ({ integrity: sri, size: data.length }))
}

module.exports.stream = writeStream

function writeStream (cache, opts) {
  opts = opts || {}
  const inputStream = new PassThrough()
  let inputErr = false

  function errCheck () {
    if (inputErr) {
      throw inputErr
    }
  }

  let allDone
  const ret = to(
    (c, n, cb) => {
      if (!allDone) {
        allDone = handleContent(inputStream, cache, opts, errCheck)
      }
      inputStream.write(c, n, cb)
    },
    (cb) => {
      inputStream.end(() => {
        if (!allDone) {
          const e = new Error('Cache input stream was empty')
          e.code = 'ENODATA'
          return ret.emit('error', e)
        }
        allDone.then(
          (res) => {
            res.integrity && ret.emit('integrity', res.integrity)
            res.size !== null && ret.emit('size', res.size)
            cb()
          },
          (e) => {
            ret.emit('error', e)
          }
        )
      })
    }
  )
  ret.once('error', (e) => {
    inputErr = e
  })
  return ret
}

function handleContent (inputStream, cache, opts, errCheck) {
  return makeTmp(cache, opts).then((tmp) => {
    errCheck()
    return pipeToTmp(inputStream, cache, tmp.target, opts, errCheck)
      .then((res) => {
        return moveToDestination(
          tmp,
          cache,
          res.integrity,
          opts,
          errCheck
        ).then(() => res)
      })
      .then((result) => makeTmpDisposer(tmp, result))
      .catch((err) => makeTmpDisposer(tmp, err, true))
  })
}

function pipeToTmp (inputStream, cache, tmpTarget, opts, errCheck) {
  return Promise.resolve().then(() => {
    let integrity
    let size
    const hashStream = ssri
      .integrityStream({
        integrity: opts.integrity,
        algorithms: opts.algorithms,
        size: opts.size
      })
      .on('integrity', (s) => {
        integrity = s
      })
      .on('size', (s) => {
        size = s
      })
    const outStream = fs.createWriteStream(tmpTarget, {
      flags: 'wx'
    })
    errCheck()
    return pipe(
      inputStream,
      hashStream,
      outStream
    )
      .then(() => {
        return { integrity, size }
      })
      .catch((err) => {
        return rimraf(tmpTarget).then(() => {
          throw err
        })
      })
  })
}

function makeTmp (cache, opts) {
  const tmpTarget = uniqueFilename(path.join(cache, 'tmp'), opts.tmpPrefix)
  return fixOwner.mkdirfix(cache, path.dirname(tmpTarget)).then(() => ({
    target: tmpTarget,
    moved: false
  }))
}

function makeTmpDisposer (tmp, result, shouldThrow = false) {
  const returnResult = () => {
    if (shouldThrow) {
      throw result
    }
    return result
  }

  if (tmp.moved) {
    return returnResult()
  }
  return rimraf(tmp.target)
    .then(
      // We don't want to catch from returnResult
      () => returnResult(),
      // If rimraf fails, we should crash process as per bluebird
      (err) => {
        throw err
      })
}

function moveToDestination (tmp, cache, sri, opts, errCheck) {
  errCheck && errCheck()
  const destination = contentPath(cache, sri)
  const destDir = path.dirname(destination)

  return fixOwner
    .mkdirfix(cache, destDir)
    .then(() => {
      errCheck && errCheck()
      return moveFile(tmp.target, destination)
    })
    .then(() => {
      errCheck && errCheck()
      tmp.moved = true
      return fixOwner.chownr(cache, destination)
    })
}

function sizeError (expected, found) {
  const err = new Error(`Bad data size: expected inserted data to be ${expected} bytes, but got ${found} instead`)
  err.expected = expected
  err.found = found
  err.code = 'EBADSIZE'
  return err
}

function checksumError (expected, found) {
  const err = new Error(`Integrity check failed:
  Wanted: ${expected}
   Found: ${found}`)
  err.code = 'EINTEGRITY'
  err.expected = expected
  err.found = found
  return err
}
