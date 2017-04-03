'use strict'

const BB = require('bluebird')

const contentPath = require('./path')
const fixOwner = require('../util/fix-owner')
const fs = require('graceful-fs')
const moveFile = require('../util/move-file')
const path = require('path')
const pipe = require('mississippi').pipe
const rimraf = BB.promisify(require('rimraf'))
const ssri = require('ssri')
const through = require('mississippi').through
const to = require('mississippi').to
const uniqueFilename = require('unique-filename')

const writeFileAsync = BB.promisify(fs.writeFile)

module.exports = write
function write (cache, data, opts) {
  opts = opts || {}
  if (opts.algorithms && opts.algorithms.length > 1) {
    throw new Error(
      'opts.algorithms only supports a single algorithm for now'
    )
  }
  if (typeof opts.size === 'number' && data.length !== opts.size) {
    return BB.reject(sizeError(opts.size, data.length))
  }
  const sri = ssri.fromData(data, opts)
  if (opts.integrity && !ssri.checkData(data, opts.integrity, opts)) {
    return BB.reject(checksumError(opts.integrity, sri))
  }
  return BB.using(makeTmp(cache, opts), tmp => (
    writeFileAsync(
      tmp.target, data, {flag: 'wx'}
    ).then(() => (
      moveToDestination(tmp, cache, sri, opts)
    ))
  )).then(() => sri)
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
      allDone.then(sri => {
        sri && ret.emit('integrity', sri)
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
  return BB.using(makeTmp(cache, opts), tmp => {
    errCheck()
    return pipeToTmp(
      inputStream, cache, tmp.target, opts, errCheck
    ).then(sri => {
      return moveToDestination(
        tmp, cache, sri, opts, errCheck
      ).then(() => sri)
    })
  })
}

function pipeToTmp (inputStream, cache, tmpTarget, opts, errCheck) {
  let sri
  const hashStream = ssri.integrityStream({
    integrity: opts.integrity,
    algorithms: opts.algorithms,
    size: opts.size
  }).on('integrity', s => {
    sri = s
  })

  let outStream = new BB((resolve, reject) => {
    errCheck()
    resolve(fs.createWriteStream(tmpTarget, {
      flags: 'wx'
    }))
  })
  return BB.using(outStream, outStream => {
    errCheck()
    return new BB((resolve, reject) => {
      errCheck()
      inputStream.on('error', reject)
      pipe(inputStream, hashStream, outStream, err => {
        errCheck()
        if (err) {
          rimraf(tmpTarget).then(() => reject(err), reject)
        } else {
          resolve(sri)
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

function moveToDestination (tmp, cache, sri, opts, errCheck) {
  errCheck && errCheck()
  const destination = contentPath(cache, sri)
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
  err.code = 'EINTEGRITY'
  err.expected = expected
  err.found = found
  return err
}
