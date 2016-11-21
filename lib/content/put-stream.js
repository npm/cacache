var contentPath = require('./path')
var crypto = require('crypto')
var dezalgo = require('dezalgo')
var extract = require('./extract')
var fixOwner = require('../util/fix-owner')
var fs = require('graceful-fs')
var hasContent = require('./read').hasContent
var lockfile = require('lockfile')
var mv = require('mv')
var path = require('path')
var pumpify = require('pumpify')
var through = require('through2')
var randomstring = require('randomstring')
var rimraf = require('rimraf')

module.exports = putStream
function putStream (cache, inputStream, opts, _cb) {
  opts = opts || {}
  var logger = wrapLogger(opts.logger || Function.prototype)
  var startTime = +(new Date())
  var tmpTarget = path.join(cache, 'tmp', (opts.tmpPrefix || '') + randomstring.generate())
  opts.extract = typeof opts.extract === 'undefined' || opts.extract

  var cb = dezalgo(function (err, digest) {
    rimraf(tmpTarget, function (err2) {
      var timeDiff = +(new Date()) - startTime
      logger('verbose', 'processed', digest, 'in', timeDiff + 'ms')
      return _cb(err2 || err, digest)
    })
  })
  hasContent(cache, opts.digest, function (err, exists) {
    if (err) { return cb(err) }
    // Fast-path-shortcut this if it's already been written.
    if (exists) {
      logger('silly', 'content already present. Skipping write.')
      return cb(err, opts.digest)
    }
    pipeToTmp(inputStream, tmpTarget, opts, function (err, digest) {
      if (err) { return cb(err) }
      logger('silly', 'Temporary file written. Verifying.')
      var verifier = opts.verify || function (target, digest, cb) { cb() }
      verifier(tmpTarget, digest, function (err) {
        if (err) { return cb(err) }
        logger('silly', 'Verified. Moving to final cache destination')
        moveToDestination(tmpTarget, cache, digest, logger, opts, function (err) {
          if (err) { return cb(err) }
          cb(null, digest)
        })
      })
    })
  })
}

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

function pipeToTmp (inputStream, tmpTarget, opts, cb) {
  fixOwner.mkdirfix(path.dirname(tmpTarget), opts.uid, opts.gid, function (err) {
    if (err) { return cb(err) }
    var hash = crypto.createHash(opts.hash || 'sha256')
    var hashStream = through(function (chunk, enc, cb) {
      hash.update(chunk, enc)
      cb(null, chunk)
    })

    var gotData = false
    var outStream = opts.extract
    ? extract(tmpTarget, opts)
    : fs.createWriteStream(tmpTarget)
    inputStream.on('data', function dataCheck (data) {
      gotData = true
      pumpify(
        inputStream, hashStream, outStream
      ).on('finish', function () {
        var digest = hash.digest('hex')
        if (opts.digest && (opts.digest !== digest)) {
          var er = new Error('digests did not match')
          er.found = digest
          er.expected = opts.digest
          return cb(er)
        }
        cb(null, digest)
      })
      inputStream.removeListener('data', dataCheck)
      inputStream.emit('data', data)
    }).on('finish', function () {
      if (!gotData) {
        var err = new Error('Input stream empty')
        err.code = 'ENODATA'
        cb(new Error('input stream empty'))
      }
    }).on('error', cb)
  })
}

function moveToDestination (tmpTarget, cache, digest, logger, opts, _cb) {
  var destination = contentPath(cache, digest)
  var lock = path.join(path.dirname(tmpTarget), digest) + '.lock'
  var cb = function (err) {
    lockfile.unlock(lock, function (er) {
      _cb(er || err)
    })
  }
  // On the vast majority of devices, the write part of the `mv` is atomic
  // since it's just a `fs.link` or `fs.rename`. The `mv` module, though,
  // is capable of moving data across devices. In that case, moves stop
  // being atomic and we can get in a bit of a mess.
  //
  // This lock can be safely removed for most operations if `mv` ends up
  // supporting some sort of callback when a move is non-atomic.
  lockfile.lock(lock, function (err) {
    if (err) { return _cb(err) }
    mv(tmpTarget, destination, {
      mkdirp: true, clobber: !!opts.clobber
    }, function (err) {
      if (err) {
        if (err.code === 'EEXIST') {
          logger('silly', digest, 'already has an entry in the cache. Skipping move. Use the clobber option to force copy')
        } else if (err.code === 'EBUSY') {
          logger('silly', digest, 'exists and is already being accessed. Skipping move.')
        } else {
          return cb(err)
        }
      }
      fixOwner.chownr(destination, opts.uid, opts.gid, cb)
    })
  })
}
