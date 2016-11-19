var crypto = require('crypto')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp')
var path = require('path')
var pumpify = require('pumpify')
var split = require('split')

module.exports.insert = insert
function insert (cache, key, digest, cb) {
  var bucket = indexPath(cache, key)
  var line = {}
  line[key] = digest
  find(cache, key, function (err, entryDigest) {
    if (err) { return cb(err) }
    if (digest === entryDigest) {
      // we already have an identical entry. No need to append.
      return cb()
    }
    mkdirp(path.dirname(bucket), function (err) {
      if (err) { return cb(err) }
      fs.appendFile(bucket, JSON.stringify(line) + '\n', function (err) {
        if (err) { return cb(err) }
        cb()
      })
    })
  })
}

module.exports.find = find
function find (cache, key, cb) {
  var bucket = indexPath(cache, key)
  var stream = fs.createReadStream(bucket)
  var digest
  pumpify(stream, split('\n', null, {trailing: true}).on('data', function (l) {
    if (!l) { return }
    try {
      var obj = JSON.parse(l)
    } catch (e) {
      return
    }
    digest = obj[key] || digest
  }).on('close', function () {
    cb(null, digest)
  })).on('error', function (e) {
    if (e.code === 'ENOENT') {
      cb(null)
    } else {
      cb(e)
    }
  })
}

function indexPath (cache, key) {
  return path.join(cache, 'index', hashKey(key))
}

function hashKey (key) {
  var hash = crypto.createHash('sha1')
  hash.update(key)
  return hash.digest('hex')
}
