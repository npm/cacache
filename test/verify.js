'use strict'

const BB = require('bluebird')

const contentPath = require('../lib/content/path')
const index = require('../lib/entry-index')
const fs = require('graceful-fs')
const path = require('path')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)
const ssri = require('ssri')

const CacheContent = require('./util/cache-content')

const CACHE = path.join(testDir, 'cache')
const CONTENT = Buffer.from('foobarbaz', 'utf8')
const KEY = 'my-test-key'
const INTEGRITY = ssri.fromData(CONTENT)
const METADATA = { foo: 'bar' }
const BUCKET = index._bucketPath(CACHE, KEY)

const verify = require('..').verify

const mkdir = BB.promisify(fs.mkdir)
const readFile = BB.promisify(fs.readFile)
const truncate = BB.promisify(fs.truncate)
const stat = BB.promisify(fs.stat)
const appendFile = BB.promisify(fs.appendFile)
const writeFile = BB.promisify(fs.writeFile)

function mockCache () {
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  return mkdir(path.join(CACHE, 'tmp')).then(() => {
    return index.insert(CACHE, KEY, INTEGRITY, {
      metadata: METADATA
    })
  })
}

test('removes corrupted index entries from buckets', t => {
  return mockCache().then(() => {
    return readFile(BUCKET, 'utf8').then((BUCKETDATA) => {
      // traaaaash
      return appendFile(BUCKET, '\n234uhhh').then(() => {
        return verify(CACHE)
      }).then((stats) => {
        t.equal(stats.missingContent, 0, 'content valid because of good entry')
        t.equal(stats.totalEntries, 1, 'only one entry counted')
        return readFile(BUCKET, 'utf8')
      }).then((bucketData) => {
        const bucketEntry = JSON.parse(bucketData.split('\t')[1])
        const targetEntry = JSON.parse(BUCKETDATA.split('\t')[1])
        targetEntry.time = bucketEntry.time // different timestamps
        t.deepEqual(
          bucketEntry, targetEntry, 'bucket only contains good entry')
      })
    })
  })
})

test('removes shadowed index entries from buckets', t => {
  return mockCache().then(() => {
    return index.insert(CACHE, KEY, INTEGRITY, {
      metadata: 'meh'
    }).then((newEntry) => {
      return verify(CACHE).then((stats) => {
        t.equal(stats.missingContent, 0, 'content valid because of good entry')
        t.equal(stats.totalEntries, 1, 'only one entry counted')
        return readFile(BUCKET, 'utf8')
      }).then((bucketData) => {
        const stringified = JSON.stringify({
          key: newEntry.key,
          integrity: newEntry.integrity.toString(),
          time: +(bucketData.match(/"time":([0-9]+)/)[1]),
          metadata: newEntry.metadata
        })
        t.equal(
          bucketData,
          `\n${index._hashEntry(stringified)}\t${stringified}`,
          'only the most recent entry is still in the bucket'
        )
      })
    })
  })
})

test('accepts function for custom user filtering of index entries', t => {
  const KEY2 = KEY + 'aaa'
  const KEY3 = KEY + 'bbb'
  return mockCache().then(() => {
    return Promise.all([
      index.insert(CACHE, KEY2, INTEGRITY, {
        metadata: 'haayyyy'
      }),
      index.insert(CACHE, KEY3, INTEGRITY, {
        metadata: 'haayyyy again'
      })
    ]).then(([entryA, entryB]) => ({
      [entryA.key]: entryA,
      [entryB.key]: entryB
    }))
  }).then((newEntries) => {
    return verify(CACHE, {
      filter (entry) {
        return entry.key.length === KEY2.length
      }
    }).then((stats) => {
      t.deepEqual({
        verifiedContent: stats.verifiedContent,
        rejectedEntries: stats.rejectedEntries,
        totalEntries: stats.totalEntries
      }, {
        verifiedContent: 1,
        rejectedEntries: 1,
        totalEntries: 2
      }, 'reported relevant changes')
      return index.ls(CACHE)
    }).then((entries) => {
      entries[KEY2].time = newEntries[KEY2].time
      entries[KEY3].time = newEntries[KEY3].time
      t.deepEqual(entries, newEntries, 'original entry not included')
    })
  })
})

test('removes corrupted content', t => {
  const cpath = contentPath(CACHE, INTEGRITY)
  return mockCache().then(() => {
    return truncate(cpath, CONTENT.length - 1)
  }).then(() => {
    return verify(CACHE)
  }).then((stats) => {
    delete stats.startTime
    delete stats.runTime
    delete stats.endTime
    t.deepEqual(stats, {
      verifiedContent: 0,
      reclaimedCount: 1,
      reclaimedSize: CONTENT.length - 1,
      badContentCount: 1,
      keptSize: 0,
      missingContent: 1,
      rejectedEntries: 1,
      totalEntries: 0
    }, 'reported correct collection counts')
    return stat(cpath).then(() => {
      throw new Error('expected a failure')
    }).catch((err) => {
      if (err.code === 'ENOENT') {
        t.match(err.message, /no such file/, 'content no longer in cache')
        return
      }
      throw err
    })
  })
})

test('removes content not referenced by any entries', t => {
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  return verify(CACHE).then((stats) => {
    delete stats.startTime
    delete stats.runTime
    delete stats.endTime
    t.deepEqual(stats, {
      verifiedContent: 0,
      reclaimedCount: 1,
      reclaimedSize: CONTENT.length,
      badContentCount: 0,
      keptSize: 0,
      missingContent: 0,
      rejectedEntries: 0,
      totalEntries: 0
    }, 'reported correct collection counts')
  })
})

test('cleans up contents of tmp dir', t => {
  const tmpFile = path.join(CACHE, 'tmp', 'x')
  const misc = path.join(CACHE, 'y')
  return mockCache().then(() => {
    return Promise.all([
      writeFile(tmpFile, ''),
      writeFile(misc, '')
    ]).then(() => verify(CACHE))
  }).then(() => {
    return Promise.all([
      stat(tmpFile).catch((err) => {
        if (err.code === 'ENOENT') {
          return err
        }
        throw err
      }),
      stat(misc)
    ]).then(([err, stat]) => {
      t.equal(err.code, 'ENOENT', 'tmp file was blown away')
      t.ok(stat, 'misc file was not touched')
    })
  })
})

test('writes a file with last verification time', t => {
  return verify(CACHE).then(() => {
    return Promise.all([
      verify.lastRun(CACHE),
      readFile(
        path.join(CACHE, '_lastverified'), 'utf8'
      ).then((data) => {
        return new Date(parseInt(data))
      })
    ]).then(([fromLastRun, fromFile]) => {
      t.equal(+fromLastRun, +fromFile, 'last verified was writen')
    })
  })
})

test('fixes permissions and users on cache contents')

test('re-builds the index with the size parameter', t => {
  const KEY2 = KEY + 'aaa'
  const KEY3 = KEY + 'bbb'
  return mockCache().then(() => {
    return Promise.all([
      index.insert(CACHE, KEY2, INTEGRITY, {
        metadata: 'haayyyy',
        size: 20
      }),
      index.insert(CACHE, KEY3, INTEGRITY, {
        metadata: 'haayyyy again',
        size: 30
      })])
  }).then(() => {
    return index.ls(CACHE).then((newEntries) => {
      return verify(CACHE)
        .then((stats) => {
          t.deepEqual({
            verifiedContent: stats.verifiedContent,
            rejectedEntries: stats.rejectedEntries,
            totalEntries: stats.totalEntries
          }, {
            verifiedContent: 1,
            rejectedEntries: 0,
            totalEntries: 3
          }, 'reported relevant changes')
          return index.ls(CACHE)
        }).then((entries) => {
          entries[KEY].time = newEntries[KEY].time
          entries[KEY2].time = newEntries[KEY2].time
          entries[KEY3].time = newEntries[KEY3].time
          t.deepEqual(entries, newEntries, 'original index entries not preserved')
        })
    })
  })
})
