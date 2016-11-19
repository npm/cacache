var crypto = require('crypto')
var dezalgo = require('dezalgo')
var fs = require('graceful-fs')
var get = require('./get')
var index = require('./entry-index')
var inflight = require('inflight')
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
function putFile (cache, key, filePath, opts, cb) {
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
  return putStream(cache, key, stream, opts, cb)
}

module.exports.stream = putStream
function putStream (cache, key, inputStream, opts, _cb) {
  if (!_cb) {
    _cb = opts
    opts = null
  }
  opts = opts || {}
  _cb = inflight('cacache.put.stream: ' + key, _cb)
  if (!_cb) { return }

  var startTime = +(new Date())
  var logger = wrapLogger(opts.logger || Function.prototype)
  var tmpTarget = path.join(cache, 'tmp', (opts.tmpPrefix || '') + randomstring.generate())
  var cb = dezalgo(function (err, digest) {
    rimraf(tmpTarget, function (err2) {
      _cb(err2 || err, digest)
    })
  })

  get.hasContent(cache, opts.digest, function (err, exists) {
    if (err) { return cb(err) }
    // Fast-path-shortcut this if it's already been written.
    if (exists) {
      logger('verbose', 'content already present. Simply adding to index')
      return index.insert(cache, key, opts.digest, function (err) {
        cb(err, opts.digest)
      })
    }
    mkdirp(tmpTarget, function (err) {
      if (err) { return cb(err) }
      pipeToTmp(inputStream, tmpTarget, opts, function (err, digest) {
        if (err) { return cb(err) }
        logger('verbose', 'Temporary file written. Verifying.')
        var verifier = opts.verify || function (target, digest, cb) { cb() }
        verifier(tmpTarget, digest, function (err) {
          if (err) { return cb(err) }
          logger('verbose', 'Verified. Moving to final cache destination')
          moveToDestination(tmpTarget, cache, digest, logger, opts, function (err) {
            if (err) { return cb(err) }
            index.insert(cache, key, digest, function (err) {
              if (err) { return cb(err) }
              var timeDiff = +(new Date()) - startTime
              logger('verbose', 'processed', digest, 'in', timeDiff + 'ms')
              cb(null, digest)
            })
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
        cb(null, hash.digest('hex'))
      })
    ).on('error', function () {
      rimraf(tmpTarget, function (err) {
        if (err) { cb(err) }
      })
    })

    // remove and re-emit
    inputStream.removeListener('data', headerCheck)
    inputStream.emit('data', c)
  }).on('close', function () {
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
    return fs.createWriteStream(path.join(target, 'index.js'))
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
  var destination = get.path(cache, digest)
  mv(tmpTarget, destination, {
    mkdirp: true, clobber: !!opts.clobber
  }, function (err) {
    if (err) {
      if (err.code === 'EEXIST') {
        logger('verbose', digest, 'already has an entry in the cache. Skipping move. Use the clobber option to force copy')
      } else if (err.code === 'EBUSY') {
        logger('verbose', digest, 'exists and is already being accessed. Skipping move.')
      } else {
        return cb(err)
      }
    }
    cb()
  })
}
