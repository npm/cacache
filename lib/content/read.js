var contentPath = require('./path')
var copy = require('fs-extra/lib/copy')
var dezalgo = require('dezalgo')
var fs = require('graceful-fs')
var pumpify = require('pumpify')
var tar = require('tar-fs')

module.exports.asDirectory = asDirectory
function asDirectory (cache, address, destination, opts, cb) {
  var cpath = contentPath(cache, address)
  copy(cpath, destination, opts, cb)
}

module.exports.hasContent = hasContent
function hasContent (cache, address, cb) {
  cb = dezalgo(cb)
  if (!address) { return cb(null, false) }
  fs.lstat(contentPath(cache, address), function (err) {
    if (err && err.code === 'ENOENT') {
      return cb(null, false)
    } else if (err) {
      return cb(err)
    } else {
      return cb(null, true)
    }
  })
}
