var crypto = require('crypto')
var fixOwner = require('./util/fix-owner')
var fs = require('graceful-fs')
var lockfile = require('lockfile')
var path = require('path')
var pumpify = require('pumpify')
var asyncMap = require('slide/lib/async-map')
var split = require('split')

module.exports.insert = insert
function insert (cache, key, digest, opts, _cb) {
  if (!_cb) {
    _cb = opts
    opts = null
  }
  opts = opts || {}
  var bucket = indexPath(cache, key)
  var lock = bucket + '.lock'
  var cb = function (err) {
    lockfile.unlock(lock, function (er) {
      _cb(er || err)
    })
  }
  fixOwner.mkdirfix(path.dirname(bucket), opts.uid, opts.gid, function (err) {
    if (err) { return _cb(err) }
    lockfile.lock(lock, function (err) {
      if (err) { return _cb(err) }
      find(cache, key, function (err, existing) {
        if (err) { cb(err) }
        if (existing && existing.digest === digest) {
          return cb()
        }
        var entry = {
          key: key,
          digest: digest,
          time: +(new Date())
        }
        fs.appendFile(bucket, JSON.stringify(entry) + '\n', function (err) {
          if (err) { return cb(err) }
          fixOwner.chownr(bucket, opts.uid, opts.gid, cb)
        })
      })
    })
  })
}

module.exports.find = find
function find (cache, key, cb) {
  var bucket = indexPath(cache, key)
  var stream = fs.createReadStream(bucket)
  var ret
  pumpify(stream, split('\n', null, {trailing: true}).on('data', function (l) {
    if (!l) { return }
    try {
      var obj = JSON.parse(l)
    } catch (e) {
      return
    }
    if (obj && (obj.key === key)) {
      ret = obj
    }
  })).on('end', function () {
    cb(null, ret)
  }).on('error', function (e) {
    if (e.code === 'ENOENT') {
      cb(null)
    } else {
      cb(e)
    }
  })
}

module.exports.delete = del
function del (cache, key, cb) {
  insert(cache, key, null, cb)
}

module.exports.ls = ls
function ls (cache, cb) {
  var indexPath = path.join(cache, 'index')
  fs.readdir(indexPath, function (err, files) {
    if (err && err.code === 'ENOENT') {
      return cb(null, {})
    } else if (err) {
      return cb(err)
    } else {
      var entries = {}
      asyncMap(files, function (f, next) {
        fs.readFile(path.join(indexPath, f), 'utf8', function (err, data) {
          if (err) { return cb(err) }
          data.split('\n').forEach(function (entry) {
            try {
              var parsed = JSON.parse(entry)
            } catch (e) {
            }
            if (parsed) {
              entries[parsed.key] = parsed
            }
          })
          next()
        })
      }, function (err) {
        cb(err, entries)
      })
    }
  })
}

module.exports.notFoundError = notFoundError
function notFoundError (cache, key) {
  var err = new Error('content not found')
  err.code = 'ENOENT'
  err.cache = cache
  err.key = key
  return err
}

function indexPath (cache, key) {
  return path.join(cache, 'index', hashKey(key))
}

function hashKey (key) {
  var hash = crypto.createHash('sha1')
  hash.update(key)
  return hash.digest('hex')
}
