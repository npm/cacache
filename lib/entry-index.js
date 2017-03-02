'use strict'

const asyncMap = require('slide/lib/async-map')
const contentPath = require('./content/path')
const crypto = require('crypto')
const fixOwner = require('./util/fix-owner')
const fs = require('graceful-fs')
const lockfile = require('lockfile')
const path = require('path')
const pipe = require('mississippi').pipe
const Promise = require('bluebird')
const split = require('split')
const through = require('mississippi').through

module.exports.insert = insert
function insert (cache, key, digest, opts) {
  opts = opts || {}
  const bucket = indexPath(cache, key)
  const lock = bucket + '.lock'
  return fixOwner.mkdirfix(
    path.dirname(bucket), opts.uid, opts.gid
  ).then(() => (
    Promise.fromNode(_cb => {
      const cb = (err, entry) => {
        lockfile.unlock(lock, er => {
          _cb(err || er, entry)
        })
      }
      lockfile.lock(lock, {
        stale: 60000,
        retries: 10,
        wait: 10000
      }, function (err) {
        if (err) { return _cb(err) }
        fs.stat(bucket, function (err, existing) {
          if (err && err.code !== 'ENOENT' && err.code !== 'EPERM') {
            return cb(err)
          }
          const entry = {
            key: key,
            digest: digest,
            hashAlgorithm: opts.hashAlgorithm,
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
          const e = (existing ? '\n' : '') + JSON.stringify(entry)
          fs.appendFile(bucket, e, function (err) {
            cb(err, entry)
          })
        })
      })
    })
  )).then(entry => {
    return fixOwner.chownr(bucket, opts.uid, opts.gid).then(() => {
      return formatEntry(cache, entry)
    })
  })
}

module.exports.find = find
function find (cache, key) {
  const bucket = indexPath(cache, key)
  const stream = fs.createReadStream(bucket)
  let ret
  return Promise.fromNode(cb => {
    pipe(stream, split('\n', null, {trailing: true}).on('data', function (l) {
      let obj
      try {
        obj = JSON.parse(l)
      } catch (e) {
        return
      }
      if (obj && (obj.key === key)) {
        ret = formatEntry(cache, obj)
      }
    }), function (err) {
      if (err && err.code === 'ENOENT') {
        cb(null, null)
      } else {
        cb(err, ret)
      }
    })
  })
}

module.exports.delete = del
function del (cache, key) {
  return insert(cache, key, null)
}

module.exports.lsStream = lsStream
function lsStream (cache) {
  const indexPath = path.join(cache, 'index')
  const stream = through.obj()
  fs.readdir(indexPath, function (err, files) {
    if (err && err.code === 'ENOENT') {
      return stream.end()
    } else if (err) {
      return stream.emit('error', err)
    } else {
      asyncMap(files, function (f, cb) {
        fs.readFile(path.join(indexPath, f), 'utf8', function (err, data) {
          if (err) { return cb(err) }
          const entries = {}
          data.split('\n').forEach(function (entry) {
            let parsed
            try {
              parsed = JSON.parse(entry)
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
function ls (cache) {
  const entries = {}
  return Promise.fromNode(cb => {
    lsStream(cache).on('finish', function () {
      cb(null, entries)
    }).on('data', function (d) {
      entries[d.key] = d
    }).on('error', cb)
  })
}

module.exports.notFoundError = notFoundError
function notFoundError (cache, key) {
  const err = new Error('content not found')
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
  // sha1 conflicts can be generated, but it doesn't matter in this case,
  // since we intend for there to be regular conflicts anyway. You can have
  // the entire cache in a single bucket and all that'll do is just make a big
  // file with a lot of contention, if you can even pull it off in the `key`
  // string. So whatever. `sha1` is faster and it doesn't trigger the warnings
  // `md5` tends to (yet?...).
  return crypto
  .createHash('sha1')
  .update(key.toLowerCase()) // lump case-variant keys into same bucket.
  .digest('hex')
  .slice(0, 7)
}

function formatEntry (cache, entry) {
  return {
    key: entry.key,
    digest: entry.digest,
    hashAlgorithm: entry.hashAlgorithm,
    path: contentPath(cache, entry.digest),
    time: entry.time,
    metadata: entry.metadata
  }
}
