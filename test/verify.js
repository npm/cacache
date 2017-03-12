'use strict'

const Buffer = require('safe-buffer').Buffer
const Promise = require('bluebird')

const crypto = require('crypto')
const contentPath = require('../lib/content/path')
const index = require('../lib/entry-index')
const fs = Promise.promisifyAll(require('graceful-fs'))
const path = require('path')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const CacheContent = require('./util/cache-content')

const CACHE = path.join(testDir, 'cache')
const CONTENT = Buffer.from('foobarbaz', 'utf8')
const KEY = 'my-test-key'
const ALGO = 'sha512'
const DIGEST = crypto.createHash(ALGO).update(CONTENT).digest('hex')
const METADATA = { foo: 'bar' }
const BUCKET = index._bucketPath(CACHE, KEY)

const verify = require('../verify')

function mockCache () {
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT
  }, ALGO))
  fixture.create(CACHE)
  return index.insert(CACHE, KEY, DIGEST, {
    metadata: METADATA,
    hashAlgorithm: ALGO
  })
}

test('removes corrupted index entries from buckets', t => {
  return mockCache().then(() => {
    return fs.readFileAsync(BUCKET, 'utf8').then(BUCKETDATA => {
      // traaaaash
      return fs.appendFileAsync(BUCKET, '\n234uhhh').then(() => {
        return verify(CACHE)
      }).then(stats => {
        t.equal(stats.missingContent, 0, 'content valid because of good entry')
        t.equal(stats.totalEntries, 1, 'only one entry counted')
        return fs.readFileAsync(BUCKET, 'utf8')
      }).then(bucketData => {
        // cleaned-up entries have different timestamps
        const newTime = bucketData.match(/"time":([0-9]+)/)[1]
        const target = BUCKETDATA.replace(/"time":[0-9]+/, `"time":${newTime}`)
        t.deepEqual(bucketData, target, 'bucket only contains good entry')
      })
    })
  })
})

test('removes shadowed index entries from buckets', t => {
  return mockCache().then(() => {
    return index.insert(CACHE, KEY, DIGEST, {
      metadata: 'meh',
      hashAlgorithm: ALGO
    }).then(newEntry => {
      return verify(CACHE).then(stats => {
        t.equal(stats.missingContent, 0, 'content valid because of good entry')
        t.equal(stats.totalEntries, 1, 'only one entry counted')
        return fs.readFileAsync(BUCKET, 'utf8')
      }).then(bucketData => {
        const stringified = JSON.stringify({
          key: newEntry.key,
          digest: newEntry.digest,
          hashAlgorithm: newEntry.hashAlgorithm,
          time: +(bucketData.match(/"time":([0-9]+)/)[1]),
          metadata: newEntry.metadata
        })
        t.equal(bucketData, `\n${stringified.length}\t${stringified}`)
      })
    })
  })
})

test('accepts function for custom user filtering of index entries', t => {
  const KEY2 = KEY + 'aaa'
  const KEY3 = KEY + 'bbb'
  return mockCache().then(() => {
    return Promise.join(
      index.insert(CACHE, KEY2, DIGEST, {
        metadata: 'haayyyy',
        hashAlgorithm: ALGO
      }),
      index.insert(CACHE, KEY3, DIGEST, {
        metadata: 'haayyyy again',
        hashAlgorithm: ALGO
      }),
      (entryA, entryB) => ({
        [entryA.key]: entryA,
        [entryB.key]: entryB
      })
    )
  }).then(newEntries => {
    return verify(CACHE, {
      filter (entry) {
        return entry.key.length === KEY2.length
      }
    }).then(stats => {
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
    }).then(entries => {
      entries[KEY2].time = newEntries[KEY2].time
      entries[KEY3].time = newEntries[KEY3].time
      t.deepEqual(entries, newEntries, 'original entry not included')
    })
  })
})

test('removes corrupted content', t => {
  const cpath = contentPath(CACHE, DIGEST)
  return mockCache().then(() => {
    return fs.truncateAsync(cpath, CONTENT.length - 1)
  }).then(() => {
    return verify(CACHE)
  }).then(stats => {
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
    return fs.statAsync(cpath).then(() => {
      throw new Error('expected a failure')
    }).catch({code: 'ENOENT'}, err => {
      t.match(err.message, /no such file/, 'content no longer in cache')
    })
  })
})

test('removes content not referenced by any entries')
test('fixes permissions and users on cache contents')
test('cleans up contents of tmp dir')
