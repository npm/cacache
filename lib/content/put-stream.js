var checkSizeStream = require('../util/check-size-stream')
var checksumStream = require('../util/checksum-stream')
var contentPath = require('./path')
var duplex = require('mississippi').duplex
var fixOwner = require('../util/fix-owner')
var fs = require('graceful-fs')
var hasContent = require('./read').hasContent
var moveFile = require('../util/move-file')
var path = require('path')
var pipeline = require('mississippi').pipeline
var rimraf = require('rimraf')
var through = require('mississippi').through
var to = require('mississippi').to
var uniqueFilename = require('unique-filename')

module.exports = putStream
function putStream (cache, opts) {
  opts = opts || {}
  var tmpTarget = uniqueFilename(path.join(cache, 'tmp'), opts.tmpPrefix)

  var inputStream = duplex()
  inputStream.on('error', function () {
    rimraf(tmpTarget, function () {})
  })

  hasContent(cache, opts.digest, function (err, exists) {
    if (err) {
      return errify(tmpTarget, inputStream, err, function () {})
    }
    // Fast-path-shortcut this if it's already been written.
    if (exists) {
      inputStream.emit('digest', opts.digest)
      inputStream.setWritable(to(function (c, en, cb) {
        cb()
      }))
      return
    }
    pipeToTmp(inputStream, cache, tmpTarget, opts)
  })

  return inputStream
}

function pipeToTmp (inputStream, cache, tmpTarget, opts, cb) {
  fixOwner.mkdirfix(path.dirname(tmpTarget), opts.uid, opts.gid, function (err) {
    if (err) { return cb(err) }
    var hashStream = checksumStream(opts.digest, opts.hashAlgorithm)
    var sizeStream = opts.size !== undefined
    ? checkSizeStream(opts.size)
    : through()
    var digest
    hashStream.on('digest', function (d) {
      digest = d
    })
    var outStream = fs.createWriteStream(tmpTarget)
    var gotData
    var teed = to(function (chunk, enc, cb) {
      gotData = true
      outStream.write(chunk, enc, cb)
    }, function (cb) {
      outStream.end(function () {
        if (!gotData) {
          var e = new Error('Input stream empty')
          e.code = 'ENODATA'
          return errify(tmpTarget, inputStream, e, function () {})
        }
        moveToDestination(tmpTarget, cache, digest, opts, function (err) {
          if (err) { return cb(err) }
          inputStream.emit('digest', digest)
          rimraf(tmpTarget, cb)
        })
      })
    })
    var combined = pipeline(sizeStream, hashStream, teed)
    outStream.on('error', function (err) {
      errify(tmpTarget, inputStream, err, function () {})
    })
    inputStream.setWritable(combined)
  })
}

function errify (file, stream, err, cb) {
  rimraf(file, function () {
    stream.emit('error', err)
    cb && cb()
  })
}

function moveToDestination (tmpTarget, cache, digest, opts, cb) {
  var destination = contentPath(cache, digest)
  var destDir = path.dirname(destination)

  fixOwner.mkdirfix(destDir, opts.uid, opts.gid, function (err) {
    if (err) { return cb(err) }
    moveFile(tmpTarget, destination, function (err) {
      if (err) { return cb(err) }
      fixOwner.chownr(destination, opts.uid, opts.gid, cb)
    })
  })
}
