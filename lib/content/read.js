var contentPath = require('./path')
var copy = require('fs-extra').copy
var dezalgo = require('dezalgo')
var extract = require('./extract')
var fs = require('graceful-fs')
var pumpify = require('pumpify')
var tar = require('tar-fs')

module.exports.asDirectory = asDirectory
function asDirectory (cache, address, destination, opts, cb) {
  ifContent(cache, address, function (err, isDir) {
    if (err) { return cb(err) }
    var cpath = contentPath(cache, address)
    if (isDir) {
      copy(cpath, destination, opts, cb)
    } else {
      pumpify(
        fs.createReadStream(cpath),
        extract(destination, opts)
      ).on('error', cb).on('finish', cb)
    }
  })
}

module.exports.asTarball = asTarball
function asTarball (cache, address, destination, opts, cb) {
  var cpath = contentPath(cache, address)
  ifContent(cache, address, function (err, isDir) {
    if (err) { return cb(err) }
    if (isDir) {
      pumpify(
        tar.pack(cpath, {
          map: opts.prefix && function (header) {
            header.name = opts.prefix + '/' + header.name
            return header
          }
        }),
        fs.createWriteStream(destination)
      ).on('error', cb).on('finish', cb)
    } else {
      copy(cpath, destination, cb)
    }
  })
}

module.exports.hasContent = hasContent
function hasContent (cache, address, cb) {
  cb = dezalgo(cb)
  if (!address) { return cb(null, false) }
  fs.stat(contentPath(cache, address), function (err, stat) {
    if (err && err.code === 'ENOENT') {
      return cb(null, false)
    } else if (err) {
      return cb(err)
    } else {
      return cb(null, true, stat.isDirectory())
    }
  })
}

function ifContent (cache, address, cb) {
  hasContent(cache, address, function (err, exists, isDir) {
    if (err) { return cb(err) }
    if (!exists) {
      err = new Error('content not found')
      err.code = 'ENOENT'
      err.cache = cache
      err.digest = address
      return cb(err)
    } else {
      cb(null, isDir)
    }
  })
}
