var fs = require('fs')
var fstream = require('fstream')
var mkdirp = require('mkdirp')
var path = require('path')
var tar = require('tar')
var zlib = require('zlib')

module.exports.directory = directory
function directory (cache, address) {
  return path.join(cache, address, 'files')
}

module.exports.tarball = tarball
function tarball (cache, address) {
  return path.join(cache, address, 'files.tgz')
}

module.exports.extract = extract
function extract (cache, address, destination, cb) {
  fs.createReadStream(
    tarball(cache, address)
  ).pipe(
    zlib.Unzip()
  ).pipe(
    tar.Extract({ path: destination })
  ).on('error', cb).on('close', function () { cb() })
}
