var contentPath = require('./path')
var crypto = require('crypto')
var dezalgo = require('dezalgo')
var fixOwner = require('../util/fix-owner')
var fs = require('graceful-fs')
var hasContent = require('./read').hasContent
var mkdirp = require('mkdirp')
var mv = require('mv')
var path = require('path')
var pumpify = require('pumpify')
var through = require('through2')
var randomstring = require('randomstring')
var rimraf = require('rimraf')
var tar = require('tar-fs')
var zlib = require('zlib')

module.exports = putStream
function putStream (cache, inputStream, opts, _cb) {
  opts = opts || {}
  var logger = wrapLogger(opts.logger || Function.prototype)
  var startTime = +(new Date())
  var tmpTarget = path.join(cache, 'tmp', (opts.tmpPrefix || '') + randomstring.generate())

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
    mkdirp(tmpTarget, function (err) {
      if (err) { return cb(err) }
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
  var hash = crypto.createHash(opts.hash || 'sha256')
  var hashStream = through(function (chunk, enc, cb) {
    hash.update(chunk, enc)
    cb(null, chunk)
  })

  var gotData = false
  inputStream.on('data', function headerCheck (c) {
    gotData = true
    pumpify(
      inputStream,
      hashStream,
      makeOutStream(c, tmpTarget, opts).on('finish', function () {
        var digest = hash.digest('hex')
        if (opts.digest && (opts.digest !== digest)) {
          var er = new Error('digests did not match')
          er.found = digest
          er.expected = opts.digest
          return cb(er)
        }
        cb(null, digest)
      })
    )

    // remove and re-emit
    inputStream.removeListener('data', headerCheck)
    inputStream.emit('data', c)
  }).on('error', cb).on('finish', function () {
    if (!gotData) {
      var err = new Error('Input stream empty')
      err.code = 'ENODATA'
      cb(new Error('input stream empty'))
    }
  })
}

function makeOutStream (c, target, opts) {
  if (opts.filename) {
    return fs.createWriteStream(path.join(target, opts.filename))
  } else if (c[0] === 0x1F && c[1] === 0x8B && c[2] === 0x08) {
    return pumpify(zlib.Unzip(), makeTarStream(target, opts))
  } else if (hasTarHeader(c)) {
    return makeTarStream(target, opts)
  } else {
    return fs.createWriteStream(path.join(target, opts.filename || 'index.js'))
  }
}

function makeTarStream (target, opts) {
  return tar.extract(target, {
    map: function (header) {
      if (process.platform !== 'win32') {
        header.uid = typeof opts.uid === 'number' ? opts.uid : header.uid
        header.gid = typeof opts.gid === 'number' ? opts.gid : header.gid
      }
      return header
    },
    ignore: opts.ignore,
    dmode: opts.dmode,
    fmode: opts.fmode,
    umask: opts.umask,
    strip: opts.strip
  })
}

function hasTarHeader (c) {
  return c[257] === 0x75 && // tar archives have 7573746172 at position
         c[258] === 0x73 && // 257 and 003030 or 202000 at position 262
         c[259] === 0x74 &&
         c[260] === 0x61 &&
         c[261] === 0x72 &&

       ((c[262] === 0x00 &&
         c[263] === 0x30 &&
         c[264] === 0x30) ||

        (c[262] === 0x20 &&
         c[263] === 0x20 &&
         c[264] === 0x00))
}

function moveToDestination (tmpTarget, cache, digest, logger, opts, cb) {
  var destination = contentPath(cache, digest)
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
    fixOwner(destination, opts.uid, opts.gid, cb)
  })
}
