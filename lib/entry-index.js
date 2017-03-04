'use strict'

const asyncMap = require('slide/lib/async-map')
const contentPath = require('./content/path')
const crypto = require('crypto')
const fixOwner = require('./util/fix-owner')
const fs = require('graceful-fs')
const path = require('path')
const Promise = require('bluebird')
const through = require('mississippi').through

const indexV = require('../package.json')['cache-version'].index

const appendFileAsync = Promise.promisify(fs.appendFile)
const readFileAsync = Promise.promisify(fs.readFile)

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
  return bucketEntries(cache, bucket).then(entries => {
    return entries.reduce((latest, next) => {
      if (next && next.key === key) {
        return formatEntry(cache, next)
      } else {
        return latest
      }
    }, null)
  }).catch(err => {
    if (err.code === 'ENOENT') {
      return null
    } else {
      throw err
    }
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
              const bpath = path.join(indexDir, bucket, f)
              bucketEntries(cache, bpath).then(_entries => {
                const entries = _entries.reduce((acc, entry) => {
                  acc[entry.key] = entry
                  return acc
                }, {})
                Object.keys(entries).forEach(function (k) {
                  stream.write(formatEntry(cache, entries[k]))
                })
                cb()
              }, err => {
                if (err.code === 'ENOENT') {
                  cb()
                } else {
                  cb(err)
                }
              })
            }, cb)
          }
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

function bucketEntries (cache, bucket, filter) {
  return readFileAsync(
    bucket, 'utf8'
  ).then(data => {
    let entries = []
    data.split('\n').forEach(entry => {
      const pieces = entry.split('\t')
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
      if (obj) {
        entries.push(obj)
      }
    })
    return entries
  })
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
