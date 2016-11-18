var crypto = require('crypto')
var fs = require('fs')
var path = require('path')
var rimraf = require('rimraf')

module.exports.path = filePath
function filePath (cache, address) {
  return path.join(cache, 'content', address)
}

module.exports.readStream = readStream
function readStream (cache, address, opts) {
  opts = opts || {}
  var localPath = filePath(cache, address)
  var stream
  try {
    stream = fs.createReadStream(localPath)
  } catch (e) {
    if (e.code === 'ENOENT') {
      return null
    } else {
      throw e
    }
  }
  var hash = crypto.createHash(opts.hash || 'sha256')
  stream.on('data', function (data) {
    hash.update(data)
  })
  stream.on('close', function () {
    var digest = hash.digest('hex')
    if (digest !== address) {
      // Local data didn't check out. Blow it away and do a cache miss.
      var err = new Error('local cache checksum failed')
      err.code = 'ECACHEINVALID'
      stream.emit('error', err)
      rimraf(localPath, function (err) {
        if (err) { stream.emit('error', err) }
      })
    }
  })
}

module.exports.readSync = readSync
function readSync (cache, address, opts) {
  opts = opts || {}
  var localPath = filePath(cache, address)
  var data
  try {
    data = fs.readFileSync(localPath)
  } catch (e) {
    if (e.code === 'ENOENT') {
      return null
    } else {
      throw e
    }
  }
  var hash = hash.createHash(opts.hash || 'sha256')
  hash.update(data)
  var digest = hash.digest('hex')
  if (digest === address) {
    return data
  } else {
    // Local data didn't check out. Blow it away and do a cache miss.
    rimraf.sync(localPath)
    return null
  }
}

module.exports.read = read
function read (cache, address, opts, cb) {
  if (!cb) {
    cb = opts
    opts = null
  }
  opts = opts || {}
  var localPath = filePath(cache, address)
  fs.readFile(localPath, function (err, data) {
    if (err && err.code === 'ENOENT') {
      cb(null, null)
    } else if (err) {
      cb(err)
    } else {
      var hash = crypto.createHash(opts.hash || 'sha256')
      hash.update(data)
      var digest = hash.digest('hex')
      if (digest === address) {
        cb(null, data)
      } else {
        // Local data didn't check out. Blow it away and do a cache miss.
        rimraf(localPath, function (err) {
          cb(err, null)
        })
      }
    }
  })
}

function _read (cache, address, reader, opts) {
  opts = opts || {}
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
