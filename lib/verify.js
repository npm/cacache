'use strict'

var asyncMap = require('slide').asyncMap
var checksumStream = require('checksum-stream')
var fixOwner = require('./util/fix-owner')
var fs = require('graceful-fs')
var index = require('./entry-index')
var lockfile = require('lockfile')
var path = require('path')
var pipe = require('mississippi').pipe
var rimraf = require('rimraf')

module.exports = verify
function verify (cache, opts, _cb) {
  if (!_cb) {
    _cb = opts
    opts = null
  }
  opts = opts || {}
  var lock = path.join(cache, 'verify.lock')
  var cb = function (err, stats) {
    lockfile.unlock(lock, function (er) {
      _cb(er || err, stats)
    })
  }
  fixOwner.mkdirfix(cache, opts.uid, opts.gid, function (err) {
    if (err) { return _cb(err) }
    lockfile.lock(lock, function (err) {
      if (err) { return _cb(err) }
      garbageCollect(cache, opts, function (err, gcStats) {
        if (err) { return cb(err) }
        tidyIndex(cache, opts, function (err, tidyStats) {
          if (err) { return cb(err) }
          var stats = tidyStats
          Object.keys(gcStats).forEach(function (key) {
            stats[key] = gcStats[key]
          })
          var verifile = path.join(cache, '_lastverified')
          fs.writeFile(verifile, '' + (+(new Date())), function (err) {
            if (err) { return cb(err) }
            fixOwner.chownr(cache, opts.uid, opts.gid, function (err) {
              if (err) { return cb(err) }
              rimraf(path.join(cache, 'tmp'), function (err) {
                if (err) { return cb(err) }
                cb(null, stats)
              })
            })
          })
        })
      })
    })
  })
}

function tidyIndex (cache, opts, cb) {
  index.ls(cache, function (err, entries) {
    if (err) { return cb(err) }
    rimraf(path.join(cache, 'index'), function (err) {
      if (err) { return cb(err) }
      var stats = {
        entriesRemoved: 0,
        digestMissing: 0,
        totalEntries: 0
      }
      asyncMap(Object.keys(entries), function (key, cb) {
        var entry = entries[key]
        if (!entry.digest) {
          stats.digestMissing++
          return cb()
        }
        var content = path.join(cache, 'content', entries[key].digest)
        fs.stat(content, function (err) {
          if (err && err.code === 'ENOENT') {
            stats.entriesRemoved++
            return cb()
          } else {
            stats.totalEntries++
            index.insert(cache, key, entry.digest, {
              uid: opts.uid,
              gid: opts.gid,
              metadata: entry.metadata
            }, cb)
          }
        })
      }, function (err) {
        if (err) { return cb(err) }
        cb(null, stats)
      })
    })
  })
}

function garbageCollect (cache, opts, cb) {
  index.ls(cache, function (err, entries) {
    var byDigest = {}
    Object.keys(entries).forEach(function (k) {
      byDigest[entries[k].digest] = entries[k]
    })
    if (err) { return cb(err) }
    var stats = {
      verifiedContent: 0,
      collectedCount: 0,
      reclaimedSize: 0
    }
    var contentDir = path.join(cache, 'content')
    fs.readdir(contentDir, function (err, files) {
      if (err && err.code === 'ENOENT') {
        return cb(null, stats)
      } else if (err) {
        return cb(err)
      } else {
        asyncMap(files, function (f, cb) {
          var fullPath = path.join(contentDir, f)
          if (byDigest[f]) {
            var algo = opts.hashAlgorithm || 'sha1'
            verifyContent(fullPath, algo, function (err, collected) {
              if (err) { return cb(err) }
              if (collected != null) {
                stats.collectedCount++
                stats.reclaimedSize += collected
              } else {
                stats.verifiedContent++
              }
              cb()
            })
          } else {
            stats.collectedCount++
            fs.stat(fullPath, function (err, s) {
              if (err) { return cb(err) }
              stats.reclaimedSize += s.size
              rimraf(path.join(contentDir, f), cb)
            })
          }
        }, function (err) {
          if (err) { return cb(err) }
          cb(null, stats)
        })
      }
    })
  })
}

function verifyContent (filepath, algo, cb) {
  fs.stat(filepath, function (err, stat) {
    if (err) { return cb(err) }
    var reader = fs.createReadStream(filepath)
    var checksummer = checksumStream({
      digest: path.basename(filepath),
      algorithm: algo
    })
    checksummer.on('data', function () {})
    pipe(reader, checksummer, function (err) {
      if (err && err.code === 'EBADCHECKSUM') {
        rimraf(filepath, function (err) {
          if (err) { return cb(err) }
          cb(null, stat.size)
        })
      } else if (err) {
        return cb(err)
      } else {
        cb(null, null)
      }
    })
  })
}

module.exports.lastRun = lastRun
function lastRun (cache, cb) {
  fs.readFile(path.join(cache, '_lastverified'), 'utf8', function (err, data) {
    if (err) { return cb(err) }
    cb(null, new Date(+data))
  })
}
