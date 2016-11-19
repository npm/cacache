var contentPath = require('./util').contentPath
var crypto = require('crypto')
var dezalgo = require('dezalgo')
var fs = require('fs')
var mkdirp = require('mkdirp')
var mv = require('mv')
var path = require('path')
var pumpify = require('pumpify')
var through = require('through2')
var randomstring = require('randomstring')
var rimraf = require('rimraf')
var tar = require('tar-fs')
var zlib = require('zlib')

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
  var logger = wrapLogger(opts.logger || noop)
  var tmpTarget = path.join(cache, 'tmp', (opts.prefix || '') + randomstring.generate())
  mkdirp(tmpTarget, function (err) {
    if (err) { return cb(err) }
    var hash = crypto.createHash(opts.hash || 'sha256')
    var hashStream = through(function (chunk, enc, cb) {
      hash.update(chunk, enc)
      cb(null, chunk)
    })
    var outStream = tar.extract(tmpTarget)
    pumpify(
      inputStream,
      hashStream,
      zlib.Unzip(),
      outStream
    ).on('error', function () {
      rimraf(tmpTarget, function (err) {
        if (err) { cb(err) }
      })
    })
    outStream.on('finish', moveToDestination)

    function moveToDestination () {
      logger('verbose', 'Temporary file written. Moving to main cache.')
      var digest = hash.digest('hex')
      var destination = contentPath(cache, digest)
      mv(tmpTarget, destination, {
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
        rimraf(tmpTarget, function (err) {
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

function wrapLogger (logObj) {
  return function () {
    if (logObj[arguments[0]]) {
      logObj[arguments[0]].apply(logObj, [].slice.call(arguments, 1))
    } else if (logObj.log) {
      logObj.log.apply(logObj, arguments)
    } else if (typeof logObj === 'function') {
      logObj.apply(null, arguments)
    }
  }
}
