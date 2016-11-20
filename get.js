var copy = require('fs-extra/lib/copy')
var dezalgo = require('dezalgo')
var fs = require('graceful-fs')
var path = require('path')

module.exports.path = contentPath
function contentPath (cache, address) {
  return path.join(cache, 'content', address)
}

module.exports.extract = extract
function extract (cache, address, destination, opts, cb) {
  copy(contentPath(cache, address), destination, opts, cb)
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
