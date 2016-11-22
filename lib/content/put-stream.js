var checksumStream = require('../util/checksum-stream')
var contentPath = require('./path')
var dezalgo = require('dezalgo')
var fixOwner = require('../util/fix-owner')
var fs = require('graceful-fs')
var hasContent = require('./read').hasContent
var lockfile = require('lockfile')
var mv = require('mv')
var path = require('path')
var pumpify = require('pumpify')
var randomstring = require('randomstring')
var rimraf = require('rimraf')

module.exports = putStream
function putStream (cache, inputStream, opts, _cb) {
  opts = opts || {}
  var tmpTarget = path.join(cache, 'tmp', (opts.tmpPrefix || '') + randomstring.generate())

  var cb = dezalgo(function (err, digest) {
    rimraf(tmpTarget, function (err2) {
      return _cb(err2 || err, digest)
    })
  })
  hasContent(cache, opts.digest || '', function (err, exists) {
    if (err) { return cb(err) }
    // Fast-path-shortcut this if it's already been written.
    if (exists) {
      return cb(err, opts.digest)
    }
    pipeToTmp(inputStream, tmpTarget, opts, function (err, digest) {
      if (err) { return cb(err) }
      moveToDestination(tmpTarget, cache, digest, opts, function (err) {
        if (err) { return cb(err) }
        cb(null, digest)
      })
    })
  })
}

function pipeToTmp (inputStream, tmpTarget, opts, cb) {
  fixOwner.mkdirfix(path.dirname(tmpTarget), opts.uid, opts.gid, function (err) {
    if (err) { return cb(err) }
    var hashStream = checksumStream(opts.digest, opts.hashAlgorithm)
    var digest
    hashStream.on('digest', function (d) { digest = d })

    var gotData = false
    var outStream = fs.createWriteStream(tmpTarget)
    inputStream.on('data', function dataCheck (data) {
      gotData = true
      pumpify(
        inputStream, hashStream, outStream
      ).on('finish', function () {
        if (!digest) { return new Error('no digest?') }
        cb(null, digest)
      })
      inputStream.removeListener('data', dataCheck)
      inputStream.emit('data', data)
    }).on('finish', function () {
      if (!gotData) {
        var err = new Error('Input stream empty')
        err.code = 'ENODATA'
        err.stream = inputStream
        cb(err)
      }
    }).on('error', cb)
  })
}

function moveToDestination (tmpTarget, cache, digest, opts, _cb) {
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
    mv(tmpTarget, destination, { mkdirp: true }, function (err) {
      if (err && !(err.code === 'EEXIST' || err.code === 'EBUSY')) {
        return cb(err)
      }
      fixOwner.chownr(destination, opts.uid, opts.gid, cb)
    })
  })
}
