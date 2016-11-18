var crypto = require('crypto')
var dezalgo = require('dezalgo')
var fs = require('fs')
var get = require('./get')
var mkdirp = require('mkdirp')
var mv = require('mv')
var path = require('path')
var pumpify = require('pumpify')
var through = require('through2')
var randomstring = require('randomstring')
var rimraf = require('rimraf')
var writeStreamAtomic = require('fs-write-stream-atomic')

module.exports.file = putFile
function putFile (cache, filePath, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  cb = dezalgo(cb)
  try {
    var stream = fs.createReadStream(filePath)
  } catch (e) {
    return cb(e)
  }
  return putStream(cache, stream, opts, cb)
}

module.exports.stream = putStream
function putStream (cache, inputStream, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  opts = opts || {}
  var startTime = +(new Date())
  var logger = opts.logger || noop
  var tmpFile = path.join(cache, 'tmp', (opts.prefix || '') + randomstring.generate())
  mkdirp(path.dirname(tmpFile), function (err) {
    if (err) { return cb(err) }
    var outStream = writeStreamAtomic(tmpFile)
    var hash = crypto.createHash(opts.algorithm || 'sha256')
    var hashStream = through(function (chunk, enc, cb) {
      hash.update(chunk, enc)
      cb(null, chunk)
    })
    pumpify(
      inputStream, hashStream, outStream
    ).on('error', function () {
      rimraf(tmpFile, function (err) {
        if (err) { cb(err) }
      })
    })
    outStream.on('close', moveToDestination)

    function moveToDestination () {
      logger('verbose', 'Temporary file written. Moving to main cache.')
      var digest = hash.digest('hex')
      var destination = get.path(cache, digest)
      mv(tmpFile, destination, {
        mkdirp: true, clobber: !!opts.clobber
      }, function (err) {
        if (err) {
          if (err.code === 'EEXIST') {
            logger('verbose', digest, 'already has an entry in the cache. Skipping move')
          } else if (err.code === 'EBUSY') {
            logger('verbose', digest, 'exists and is already being accessed. Skipping move.')
          } else {
            return cb(err)
          }
        }
        rimraf(tmpFile, function (err) {
          if (err) { return cb(err) }
          var timeDiff = +(new Date()) - startTime
          logger('verbose', 'processed', digest, 'in', timeDiff + 'ms')
          cb(null, digest)
        })
      })
    }
  })
}

function noop () {}
