var index = require('./lib/entry-index')
var read = require('./lib/content/read')

module.exports.directory = directory
function directory (cache, key, destination, opts, cb) {
  index.find(cache, key, function (err, digest) {
    if (err) { return cb(err) }
    read.asDirectory(cache, digest, destination, opts, cb)
  })
}

module.exports.tarball = tarball
function tarball (cache, key, destination, opts, cb) {
  index.find(cache, key, function (err, digest) {
    if (err) { return cb(err) }
    read.asTarball(cache, digest, destination, opts, cb)
  })
}
