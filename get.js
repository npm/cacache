var fs = require('fs')
var path = require('path')

module.exports.path = filePath
function filePath (cache, address) {
  return path.join(cache, 'content', address)
}

module.exports.readStream = readStream
function readStream (cache, address) {
  return _read(cache, address, fs.createReadStream)
}

module.exports.readSync = readSync
function readSync (cache, address) {
  return _read(cache, address, fs.readFileSync)
}

module.exports.read = read
function read (cache, address, cb) {
  fs.readFile(filePath(cache, address), function (err, data) {
    if (err && err.code === 'ENOENT') {
      cb(null, null)
    } else if (err) {
      cb(err)
    } else {
      cb(null, data)
    }
  })
}

function _read (cache, address, reader) {
  try {
    return reader(filePath(cache, address))
  } catch (e) {
    if (e.code === 'ENOENT') {
      return null
    } else {
      throw e
    }
  }
}
