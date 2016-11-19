var crypto = require('crypto')
var fs = require('graceful-fs')
var mkdirp = require('mkdirp')
var path = require('path')
var pumpify = require('pumpify')
var asyncMap = require('slide').asyncMap
var split = require('split')

module.exports.insert = insert
function insert (cache, key, digest, cb) {
  var bucket = indexPath(cache, key)
  var entry = {
    key: key,
    digest: digest,
    time: +(new Date())
  }
  // TODO - do this in a single atomic streaming operation
  // that leans on `graceful-fs` to insert on the fly or
  // something.
  find(cache, key, function (err, entryDigest) {
    if (err) { return cb(err) }
    if (digest === entryDigest) {
      // we already have an identical entry. No need to append.
      return cb()
    }
    mkdirp(path.dirname(bucket), function (err) {
      if (err) { return cb(err) }
      fs.appendFile(bucket, JSON.stringify(entry) + '\n', function (err) {
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
    if (obj && (obj.key === key)) {
      digest = obj.digest
    }
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

module.exports.delete = del
function del (cache, key, address, cb) {
  if (!cb) {
    cb = address
    address = null
  }
  // NOTE - `del` is *not* concurrency-safe if find/ls/insert
  //        could be happening at the same time!
  //        But it's not meant to be used in situations
  //        where that would be the case. So don't do it.
  if (!address) {
    insert(cache, key, null, cb)
  } else {
    cb(new Error('deleting by address not yet supported`dd`'))
  }
}

module.exports.ls = ls
function ls (cache, cb) {
  var indexPath = path.join(cache, 'index')
  fs.readdir(indexPath, function (err, files) {
    if (err && err.code !== 'ENOENT') {
      return cb(err)
    } else if (err && err.code === 'ENOENT') {
      return cb(null, [])
    } else {
      var entries = {}
      asyncMap(files, function (f, cb) {
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
            cb()
          })
        })
      }, function (err) {
        cb(err, entries)
      })
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
