var index = require('./lib/entry-index')
var read = require('./lib/content/read')

module.exports.directory = directory
function directory (cache, key, destination, opts, cb) {
  index.find(cache, key, function (err, data) {
    if (err) { return cb(err) }
    if (!data) { return cb(index.notFoundError(cache, key)) }
    read.asDirectory(cache, data.digest, destination, opts, cb)
  })
}

module.exports.tarball = tarball
function tarball (cache, key, destination, opts, cb) {
  index.find(cache, key, function (err, data) {
    if (err) { return cb(err) }
    if (!data) { return cb(index.notFoundError(cache, key)) }
    read.asTarball(cache, data.digest, destination, opts, cb)
  })
}

module.exports.info = info
function info (cache, key, cb) {
  index.find(cache, key, cb)
}
