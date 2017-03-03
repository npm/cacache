'use strict'

const asyncMap = require('slide/lib/async-map')
const contentPath = require('./content/path')
const crypto = require('crypto')
const fixOwner = require('./util/fix-owner')
const fs = require('graceful-fs')
const path = require('path')
const pipe = require('mississippi').pipe
const Promise = require('bluebird')
const split = require('split')
const through = require('mississippi').through

const indexV = require('../package.json')['cache-version'].index

const appendFileAsync = Promise.promisify(fs.appendFile)

module.exports.insert = insert
function insert (cache, key, digest, opts) {
  opts = opts || {}
  const bucket = bucketPath(cache, key)
  return fixOwner.mkdirfix(
    path.dirname(bucket), opts.uid, opts.gid
  ).then(() => {
    const entry = {
      key: key,
      digest: digest,
      hashAlgorithm: opts.hashAlgorithm,
      time: +(new Date()),
      metadata: opts.metadata
    }
    const stringified = JSON.stringify(entry)
    // NOTE - Cleverness ahoy!
    //
    // This works because it's tremendously unlikely for an entry to corrupt
    // another while still preserving the string length of the JSON in
    // question. So, we just slap the length in there and verify it on read.
    //
    // Thanks to @isaacs for the whiteboarding session that ended up with this.
    return appendFileAsync(
      bucket, `\n${stringified.length}\t${stringified}`
    ).then(() => entry)
  }).then(entry => (
    fixOwner.chownr(bucket, opts.uid, opts.gid).then(() => (
      formatEntry(cache, entry)
    ))
  ))
}

module.exports.find = find
function find (cache, key) {
  const bucket = bucketPath(cache, key)
  const stream = fs.createReadStream(bucket)
  let ret
  return Promise.fromNode(cb => {
    pipe(stream, split('\n', null, {trailing: true}).on('data', function (l) {
      const pieces = l.split('\t')
      if (!pieces[1] || pieces[1].length !== parseInt(pieces[0], 10)) {
        // Length is no good! Corruption ahoy!
        return
      }
      let obj
      try {
        obj = JSON.parse(pieces[1])
      } catch (e) {
        // Entry is corrupted!
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
  const indexDir = bucketDir(cache)
  const stream = through.obj()
  fs.readdir(indexDir, function (err, buckets) {
    if (err && err.code === 'ENOENT') {
      return stream.end()
    } else if (err) {
      return stream.emit('error', err)
    } else {
      asyncMap(buckets, (bucket, cb) => {
        fs.readdir(path.join(indexDir, bucket), (err, files) => {
          if (err && err.code === 'ENOENT') {
            return cb()
          } else if (err) {
            return cb(err)
          } else {
            asyncMap(files, function (f, cb) {
              fs.readFile(path.join(indexDir, bucket, f), 'utf8', function (err, data) {
                if (err) { return cb(err) }
                const entries = {}
                data.split('\n').slice(1).forEach(function (entry) {
                  const pieces = entry.split('\t')
                  if (pieces[1].length !== parseInt(pieces[0], 10)) {
                    // Length is no good! Corruption ahoy!
                    return
                  }
                  let parsed
                  try {
                    parsed = JSON.parse(pieces[1])
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
              cb(err)
            })
          }
        })
      }, err => {
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

function bucketDir (cache) {
  return path.join(cache, `index-v${indexV}`)
}

module.exports._bucketPath = bucketPath
function bucketPath (cache, key) {
  const hashed = hashKey(key)
  return path.join(bucketDir(cache), hashed.slice(0, 2), hashed.slice(2))
}

module.exports._hashKey = hashKey
function hashKey (key) {
  return crypto
  .createHash('sha256')
  .update(key)
  .digest('hex')
}

function formatEntry (cache, entry) {
  return {
    key: entry.key,
    digest: entry.digest,
    hashAlgorithm: entry.hashAlgorithm,
    path: contentPath(cache, entry.digest, entry.hashAlgorithm),
    time: entry.time,
    metadata: entry.metadata
  }
}
