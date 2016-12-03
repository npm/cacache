var checkSizeStream = require('../util/check-size-stream')
var checksumStream = require('../util/checksum-stream')
var contentPath = require('./path')
var dezalgo = require('dezalgo')
var fixOwner = require('../util/fix-owner')
var fs = require('graceful-fs')
var hasContent = require('./read').hasContent
var move = require('../util/move')
var once = require('once')
var path = require('path')
var pipe = require('mississippi').pipe
var randomstring = require('randomstring')
var rimraf = require('rimraf')
var through = require('mississippi').through

module.exports = putStream
function putStream (cache, inputStream, opts, _cb) {
  if (!_cb) {
    _cb = opts
    opts = null
  }
  opts = opts || {}
  var tmpTarget = path.join(cache, 'tmp', (opts.tmpPrefix || '') + randomstring.generate())

  var cb = dezalgo(once(function (err, digest) {
    rimraf(tmpTarget, function (err2) {
      return _cb(err2 || err, digest)
    })
  }))
  inputStream.on('error', cb)
  hasContent(cache, opts.digest, function (err, exists) {
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
    var sizeStream = opts.size !== undefined
    ? checkSizeStream(opts.size)
    : through()
    var digest
    hashStream.on('digest', function (d) { digest = d })

    var gotData = false
    var outStream = fs.createWriteStream(tmpTarget)
    inputStream.on('data', function dataCheck () {
      gotData = true
      inputStream.removeListener('data', dataCheck)
    })
    pipe(
      inputStream,
      sizeStream,
      hashStream,
      outStream,
      function (err) {
        if (err) { return cb(err) }
        if (!gotData) {
          var e = new Error('Input stream empty')
          e.code = 'ENODATA'
          e.stream = inputStream
          return cb(e)
        }
        cb(null, digest)
      }
    )
  })
}

function moveToDestination (tmpTarget, cache, digest, opts, cb) {
  var destination = contentPath(cache, digest)
  var destDir = path.dirname(destination)

  fixOwner.mkdirfix(destDir, opts.uid, opts.gid, function (err) {
    if (err) { return cb(err) }
    move(tmpTarget, destination, function (err) {
      if (err) { return cb(err) }
      fixOwner.chownr(destination, opts.uid, opts.gid, cb)
    })
  })
}
