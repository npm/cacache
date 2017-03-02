'use strict'

const Promise = require('bluebird')

var checksumStream = require('checksum-stream')
var fixOwner = require('./util/fix-owner')
var fs = require('graceful-fs')
var index = require('./entry-index')
var lockfile = Promise.promisifyAll(require('lockfile'))
var path = require('path')
var pipe = Promise.promisify(require('mississippi').pipe)
var rimraf = Promise.promisify(require('rimraf'))

Promise.promisifyAll(fs)

module.exports = verify
function verify (cache, opts) {
  opts = opts || {}
  opts.log && opts.log.verbose('verify', 'verifying content cache at', cache)
  const startTime = +(new Date())
  return fixOwner.mkdirfix(
    cache, opts.uid, opts.gid
  ).then(() => {
    const lockPath = path.join(cache, 'verify.lock')
    const lock = lockfile.lockAsync(lockPath).disposer(() => {
      return lockfile.unlock(lockPath)
    })
    return Promise.using(lock, () => {
      return garbageCollect(cache, opts).then(gcStats => {
        return tidyIndex(cache, opts).then(tidyStats => {
          var stats = tidyStats
          Object.keys(gcStats).forEach(function (key) {
            stats[key] = gcStats[key]
          })
          return stats
        })
      }).then(stats => {
        var verifile = path.join(cache, '_lastverified')
        opts.log && opts.log.verbose('verify', 'writing verifile to ' + verifile)
        return fs.writeFileAsync(
          verifile, '' + (+(new Date()))
        ).then(() => {
          opts.log && opts.log.verbose('verify', 'fixing cache ownership')
          return fixOwner.chownr(cache, opts.uid, opts.gid)
        }).then(() => {
          opts.log && opts.log.verbose('verify', 'clearing out tmp')
          return rimraf(path.join(cache, 'tmp'))
        }).then(() => stats)
      })
    })
  }).then(stats => {
    stats.runTime = (+(new Date()) - startTime) / 1000
    opts.log && opts.log.verbose('verify', 'final stats:', stats)
    return stats
  })
}

function tidyIndex (cache, opts) {
  opts.log && opts.log.verbose('verify', 'tidying index')
  return index.ls(cache).then(entries => {
    return rimraf(path.join(cache, 'index')).then(() => {
      var stats = {
        entriesRemoved: 0,
        digestMissing: 0,
        totalEntries: 0
      }
      return Promise.reduce(Object.keys(entries), (stats, key) => {
        var entry = entries[key]
        if (!entry.digest) {
          stats.digestMissing++
          return stats
        }
        var content = path.join(cache, 'content', entries[key].digest)
        return fs.statAsync(content).catch(err => {
          if (err.code === 'ENOENT') {
            stats.entriesRemoved++
            return stats
          }
        }).then(() => {
          stats.totalEntries++
          return index.insert(cache, key, entry.digest, {
            uid: opts.uid,
            gid: opts.gid,
            metadata: entry.metadata
          }).then(() => stats)
        })
      }, stats)
    })
  })
}

function garbageCollect (cache, opts) {
  opts.log && opts.log.verbose('verify', 'garbage collecting content')
  return index.ls(cache).then(entries => {
    var byDigest = {}
    Object.keys(entries).forEach(function (k) {
      byDigest[entries[k].digest] = entries[k]
    })
    var contentDir = path.join(cache, 'content')
    return fs.readdirAsync(contentDir).catch(err => {
      if (err.code === 'ENOENT') {
        return
      } else {
        throw err
      }
    }).then(files => {
      var stats = {
        verifiedContent: 0,
        collectedCount: 0,
        reclaimedSize: 0,
        keptSize: 0
      }
      return Promise.reduce(files, (stats, f) => {
        var fullPath = path.join(contentDir, f)
        if (byDigest[f]) {
          var algo = opts.hashAlgorithm || 'sha512'
          return verifyContent(fullPath, algo).then(info => {
            if (!info.valid) {
              stats.collectedCount++
              stats.reclaimedSize += info.size
            } else {
              stats.verifiedContent++
              stats.keptSize += info.size
            }
            return stats
          })
        } else {
          stats.collectedCount++
          return fs.statAsync(fullPath).then(s => {
            stats.reclaimedSize += s.size
            return rimraf(path.join(contentDir, f)).then(() => stats)
          })
        }
      }, stats)
    })
  })
}

function verifyContent (filepath, algo) {
  return fs.statAsync(filepath).then(stat => {
    var reader = fs.createReadStream(filepath)
    var checksummer = checksumStream({
      digest: path.basename(filepath),
      algorithm: algo
    })
    var contentInfo = {
      size: stat.size,
      valid: true
    }
    checksummer.on('data', () => {})
    return pipe(reader, checksummer).catch(err => {
      if (err && err.code === 'EBADCHECKSUM') {
        return rimraf(filepath).then(() => {
          contentInfo.valid = false
        })
      } else {
        throw err
      }
    }).then(() => contentInfo)
  })
}

module.exports.lastRun = lastRun
function lastRun (cache) {
  return fs.readFileAsync(
    path.join(cache, '_lastverified'), 'utf8'
  ).then(data => new Date(+data))
}
