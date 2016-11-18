var crypto = require('crypto')
var get = require('./get')
var mkdirp = require('mkdirp')
var mv = require('mv')
var path = require('path')
var pumpify = require('pumpify')
var tar = require('tar')
var through = require('through2')
var randomstring = require('randomstring')
var rimraf = require('rimraf')
var writeStreamAtomic = require('fs-write-stream-atomic')
var zlib = require('zlib')

module.exports = put

// Returns a writable stream to write a tarball to
function put (cache, opts) {
  opts = opts || {}
  var logger = function () { console.log.apply(console, arguments) }
  var tmp = path.join(cache, 'tmp', (opts.prefix || '') + randomstring.generate())
  var tmpFile = path.join(tmp, 'files.tgz')
  var tmpDir = path.join(tmp, 'files')

  var hash = crypto.createHash(opts.algorithm || 'sha256')
  var stream = through(function (chunk, enc, cb) {
    hash.update(chunk, enc)
    cb(null, chunk)
  })

  // debugging
  stream.on('error', function (err) {
    logger('error', err)
  })
  stream.on('close', function () {
    logger('closed read stream')
  })

  mkdirp(tmpDir, function (err) {
    if (err) { return stream.emit('error', err) }
    var outStream = writeStreamAtomic(tmpFile)
    var extractStream = pumpify(zlib.Unzip(), tar.Extract({
      path: tmpDir,
      strip: 1
    }).on('entry', function (e) { stream.emit('entry', e) }))
    var teeStream = through(function (chunk, enc, next) {
      outStream.write(chunk, enc, function () {
        next(null, chunk)
      })
    })

    var errEmitted = false
    linkStreams(teeStream, outStream, function () { errEmitted = true })
    pumpify(
      stream, teeStream, extractStream
    ).on('end', function () {
      logger('silly', 'streams closed.')
      if (!errEmitted) { outStream.end() }
    }).on('error', function () {
      rimraf(tmp, function (err) {
        if (err) { throw err }
      })
    }).on('data', function () {})
    outStream.on('close', moveToDestination)

    function moveToDestination () {
      logger('verbose', 'Temporary files written. Moving to main cache.')
      var digest = hash.digest('hex')
      var destination = get.tarball(cache, digest)
      mv(tmp, path.dirname(destination), {
        mkdirp: true, clobber: !!opts.clobber
      }, function (err) {
        if (err) {
          if (err.code === 'EEXIST') {
            logger('verbose', digest, 'already has an entry in the cache. Skipping move')
          } else {
            return stream.emit('error', err)
          }
        }
        rimraf(tmp, function (err) {
          if (err) { return stream.emit('error', err) }
          logger('verbose', 'done processing', digest)
          stream.emit('digest', digest)
        })
      })
    }
  })

  return stream
}

function linkStreams (a, b, cb) {
  var lastError = null
  a.on('error', function (err) {
    if (err !== lastError) {
      lastError = err
      b.emit('error', err)
      cb && cb(err)
    }
  })
  b.on('error', function (err) {
    if (err !== lastError) {
      lastError = err
      a.emit('error', err)
      cb && cb(err)
    }
  })
}
