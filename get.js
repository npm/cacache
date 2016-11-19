var copy = require('fs-extra').copy
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
  fs.stat(contentPath(cache, address), function (err) {
    if (err && err.code !== 'ENOENT') {
      return cb(err)
    } else if (err && err.code === 'ENOENT') {
      return cb(null, false)
    } else {
      return cb(null, true)
    }
  })
}
