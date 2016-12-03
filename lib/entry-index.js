var asyncMap = require('slide/lib/async-map')
var contentPath = require('./content/path')
var crypto = require('crypto')
var fixOwner = require('./util/fix-owner')
var fs = require('graceful-fs')
var lockfile = require('lockfile')
var path = require('path')
var pipeline = require('mississippi').pipeline
var split = require('split')
var through = require('mississippi').through

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
          if (typeof opts.override === 'undefined' || !opts.override) {
            return cb()
          }
        }
        var entry = {
          key: key,
          digest: digest,
          time: +(new Date()),
          metadata: opts.metadata
        }
        // Because of the way these entries work,
        // the index is safe from fs.appendFile stopping
        // mid-write so long as newlines are *prepended*
        //
        // That is, if a write fails, it will be ignored
        // by `find`, and the next successful one will be
        // used.
        //
        // This should be -very rare-, since `fs.appendFile`
        // will often be atomic on most platforms unless
        // very large metadata has been included, but caches
        // like this one tend to last a long time. :)
        // Most corrupted reads are likely to be from attempting
        // to read the index while it's being written to --
        // which is safe, but not guaranteed to be atomic.
        var e = (existing ? '\n' : '') + JSON.stringify(entry)
        fs.appendFile(bucket, e, function (err) {
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
  pipeline(stream, split('\n', null, {trailing: true}).on('data', function (l) {
    try {
      var obj = JSON.parse(l)
    } catch (e) {
      return
    }
    if (obj && (obj.key === key)) {
      ret = formatEntry(cache, obj)
    }
  })).on('finish', function () {
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

module.exports.lsStream = lsStream
function lsStream (cache) {
  var indexPath = path.join(cache, 'index')
  var stream = through.obj()
  fs.readdir(indexPath, function (err, files) {
    if (err && err.code === 'ENOENT') {
      return stream.end()
    } else if (err) {
      return stream.emit('error', err)
    } else {
      asyncMap(files, function (f, cb) {
        fs.readFile(path.join(indexPath, f), 'utf8', function (err, data) {
          if (err) { return cb(err) }
          var entries = {}
          data.split('\n').forEach(function (entry) {
            try {
              var parsed = JSON.parse(entry)
            } catch (e) {
            }
            // NOTE - it's possible for an entry to be
            //        incomplete/corrupt. So we just skip it.
            //        See comment on `insert()` for deets.
            if (parsed) {
              entries[parsed.key] = formatEntry(cache, parsed)
            }
          })
          Object.keys(entries).forEach(function (k) {
            stream.write(entries[k])
          })
          cb()
        })
      }, function (err) {
        if (err) { stream.emit('error') }
        stream.end()
      })
    }
  })
  return stream
}

module.exports.ls = ls
function ls (cache, cb) {
  var entries = {}
  lsStream(cache).on('finish', function () {
    cb(null, entries)
  }).on('data', function (d) {
    entries[d.key] = d
  }).on('error', cb)
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

module.exports._hashKey = hashKey
function hashKey (key) {
  return crypto.createHash('sha1').update(key).digest('hex')
}

function formatEntry (cache, entry) {
  return {
    key: entry.key,
    digest: entry.digest,
    path: contentPath(cache, entry.digest),
    time: entry.time,
    metadata: entry.metadata
  }
}
