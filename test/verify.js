'use strict'

const contentPath = require('../lib/content/path')
const index = require('../lib/entry-index')
const fs = require('fs/promises')
const path = require('path')
const t = require('tap')
const ssri = require('ssri')

const CacheContent = require('./fixtures/cache-content')

const CONTENT = Buffer.from('foobarbaz', 'utf8')
const KEY = 'my-test-key'
const INTEGRITY = ssri.fromData(CONTENT)
const METADATA = { foo: 'bar' }

const verify = require('..').verify

// defines reusable errors
const genericError = new Error('ERR')
genericError.code = 'ERR'

// helpers
const getVerify = (t, opts) => t.mock('../lib/verify', opts)

async function mockCache (t) {
  const cacheContent = CacheContent({
    [INTEGRITY]: CONTENT,
  })
  cacheContent.tmp = {}
  const CACHE = t.testdir(cacheContent)
  await index.insert(CACHE, KEY, INTEGRITY, {
    metadata: METADATA,
  })
  return CACHE
}

t.test('removes corrupted index entries from buckets', async t => {
  const CACHE = await mockCache(t)
  const BUCKET = index.bucketPath(CACHE, KEY)
  const BUCKETDATA = await fs.readFile(BUCKET, 'utf8')
  // traaaaash
  await fs.appendFile(BUCKET, '\n234uhhh')
  const stats = await verify(CACHE)
  t.equal(
    stats.missingContent,
    0,
    'content valid because of good entry'
  )
  t.equal(stats.totalEntries, 1, 'only one entry counted')
  const bucketData = await fs.readFile(BUCKET, 'utf8')
  const bucketEntry = JSON.parse(bucketData.split('\t')[1])
  const targetEntry = JSON.parse(BUCKETDATA.split('\t')[1])
  targetEntry.time = bucketEntry.time // different timestamps
  t.same(
    bucketEntry,
    targetEntry,
    'bucket only contains good entry'
  )
})

t.test('removes shadowed index entries from buckets', async t => {
  const CACHE = await mockCache(t)
  const BUCKET = index.bucketPath(CACHE, KEY)
  const newEntry = await index.insert(CACHE, KEY, INTEGRITY, { metadata: 'meh' })
  const stats = await verify(CACHE)
  t.equal(
    stats.missingContent,
    0,
    'content valid because of good entry'
  )
  t.equal(stats.totalEntries, 1, 'only one entry counted')
  const bucketData = await fs.readFile(BUCKET, 'utf8')
  const stringified = JSON.stringify({
    key: newEntry.key,
    integrity: newEntry.integrity.toString(),
    time: +bucketData.match(/"time":([0-9]+)/)[1],
    metadata: newEntry.metadata,
  })
  t.equal(
    bucketData,
    `\n${index.hashEntry(stringified)}\t${stringified}`,
    'only the most recent entry is still in the bucket'
  )
})

t.test('accepts function for custom user filtering of index entries', async t => {
  const KEY2 = KEY + 'aaa'
  const KEY3 = KEY + 'bbb'
  const CACHE = await mockCache(t)
  const [entryA, entryB] = await Promise.all([
    index.insert(CACHE, KEY2, INTEGRITY, {
      metadata: 'haayyyy',
    }),
    index.insert(CACHE, KEY3, INTEGRITY, {
      metadata: 'haayyyy again',
    }),
  ])
  const newEntries = {
    [entryA.key]: entryA,
    [entryB.key]: entryB,
  }
  const stats = await verify(CACHE, {
    filter (entry) {
      return entry.key.length === KEY2.length
    },
  })
  t.same(
    {
      verifiedContent: stats.verifiedContent,
      rejectedEntries: stats.rejectedEntries,
      totalEntries: stats.totalEntries,
    },
    {
      verifiedContent: 1,
      rejectedEntries: 1,
      totalEntries: 2,
    },
    'reported relevant changes'
  )
  const entries = await index.ls(CACHE)
  entries[KEY2].time = newEntries[KEY2].time
  entries[KEY3].time = newEntries[KEY3].time
  t.same(entries, newEntries, 'original entry not included')
})

t.test('removes corrupted content', async t => {
  const CACHE = await mockCache(t)
  const cpath = contentPath(CACHE, INTEGRITY)
  await fs.truncate(cpath, CONTENT.length - 1)
  const stats = await verify(CACHE)
  delete stats.startTime
  delete stats.runTime
  delete stats.endTime
  t.same(
    stats,
    {
      verifiedContent: 0,
      reclaimedCount: 1,
      reclaimedSize: CONTENT.length - 1,
      badContentCount: 1,
      keptSize: 0,
      missingContent: 1,
      rejectedEntries: 1,
      totalEntries: 0,
    },
    'reported correct collection counts'
  )
  await t.rejects(
    fs.stat(cpath),
    /no such file/,
    'content no longer in cache'
  )
})

t.test('removes content not referenced by any entries', async t => {
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  const stats = await verify(CACHE)
  delete stats.startTime
  delete stats.runTime
  delete stats.endTime
  t.same(
    stats,
    {
      verifiedContent: 0,
      reclaimedCount: 1,
      reclaimedSize: CONTENT.length,
      badContentCount: 0,
      keptSize: 0,
      missingContent: 0,
      rejectedEntries: 0,
      totalEntries: 0,
    },
    'reported correct collection counts'
  )
})

t.test('cleans up contents of tmp dir', async t => {
  const CACHE = await mockCache(t)
  const tmpFile = path.join(CACHE, 'tmp', 'x')
  const misc = path.join(CACHE, 'y')
  await Promise.all([fs.writeFile(tmpFile, ''), fs.writeFile(misc, '')])
  await verify(CACHE)
  const [err, stat] = await Promise.all([
    fs.stat(tmpFile).catch((err) => {
      if (err.code === 'ENOENT') {
        return err
      }

      throw err
    }),
    fs.stat(misc),
  ])
  t.equal(err.code, 'ENOENT', 'tmp file was blown away')
  t.ok(stat, 'misc file was not touched')
})

t.test('writes a file with last verification time', async t => {
  const CACHE = t.testdir()
  await verify(CACHE)
  const [fromLastRun, fromFile] = await Promise.all([
    verify.lastRun(CACHE),
    fs.readFile(path.join(CACHE, '_lastverified'), 'utf8').then((data) => {
      return new Date(parseInt(data))
    }),
  ])
  t.equal(+fromLastRun, +fromFile, 'last verified was writen')
})

t.test('missing file error when validating cache content', async t => {
  const missingFileError = new Error('ENOENT')
  missingFileError.code = 'ENOENT'
  const mockVerify = getVerify(t, {
    'fs/promises': Object.assign({}, fs, {
      stat: async (path) => {
        throw missingFileError
      },
    }),
  })

  t.plan(1)
  const CACHE = await mockCache(t)
  await t.resolveMatch(
    mockVerify(CACHE),
    {
      verifiedContent: 0,
      rejectedEntries: 1,
      totalEntries: 0,
    },
    'should reject entry'
  )
})

t.test('unknown error when validating content', async t => {
  const mockVerify = getVerify(t, {
    'fs/promises': Object.assign({}, fs, {
      stat: async (path) => {
        throw genericError
      },
    }),
  })

  t.plan(1)
  const CACHE = await mockCache(t)
  await t.rejects(
    mockVerify(CACHE),
    genericError,
    'should throw any unknown errors'
  )
})

t.test('unknown error when checking sri stream', async t => {
  const mockVerify = getVerify(t, {
    ssri: Object.assign({}, ssri, {
      checkStream: () => Promise.reject(genericError),
    }),
  })

  const CACHE = await mockCache(t)
  await t.rejects(
    mockVerify(CACHE),
    genericError,
    'should throw any unknown errors'
  )
})

t.test('unknown error when rebuilding bucket', async t => {
  // rebuild bucket uses stat after content-validation
  // shouldFail controls the right time to mock the error
  let shouldFail = false
  const mockVerify = getVerify(t, {
    'fs/promises': Object.assign({}, fs, {
      stat: async (path) => {
        if (shouldFail) {
          throw genericError
        }
        shouldFail = true
        return fs.stat(path)
      },
    }),
  })

  const CACHE = await mockCache(t)
  await t.rejects(
    mockVerify(CACHE),
    genericError,
    'should throw any unknown errors'
  )
})

t.test('re-builds the index with the size parameter', async t => {
  const KEY2 = KEY + 'aaa'
  const KEY3 = KEY + 'bbb'
  const CACHE = await mockCache(t)
  await Promise.all([
    index.insert(CACHE, KEY2, INTEGRITY, {
      metadata: 'haayyyy',
      size: 20,
    }),
    index.insert(CACHE, KEY3, INTEGRITY, {
      metadata: 'haayyyy again',
      size: 30,
    }),
  ])
  const newEntries = await index.ls(CACHE)
  const stats = await verify(CACHE)
  t.same(
    {
      verifiedContent: stats.verifiedContent,
      rejectedEntries: stats.rejectedEntries,
      totalEntries: stats.totalEntries,
    },
    {
      verifiedContent: 1,
      rejectedEntries: 0,
      totalEntries: 3,
    },
    'reported relevant changes'
  )
  const entries = await index.ls(CACHE)
  entries[KEY].time = newEntries[KEY].time
  entries[KEY2].time = newEntries[KEY2].time
  entries[KEY3].time = newEntries[KEY3].time
  t.same(
    entries,
    newEntries,
    'original index entries not preserved'
  )
})

t.test('hash collisions', async t => {
  const mockVerify = getVerify(t, {
    '../lib/entry-index': Object.assign({}, index, {
      hashKey: () => 'aaa',
    }),
  })

  t.plan(1)
  const CACHE = await mockCache(t)
  await index.insert(CACHE, 'foo', INTEGRITY, {
    metadata: 'foo',
  })
  const stats = await mockVerify(CACHE)
  t.same(
    {
      verifiedContent: stats.verifiedContent,
      rejectedEntries: stats.rejectedEntries,
      totalEntries: stats.totalEntries,
    },
    {
      verifiedContent: 1,
      rejectedEntries: 0,
      totalEntries: 2,
    },
    'should resolve with no errors'
  )
})

t.test('hash collisions excluded', async t => {
  const mockVerify = getVerify(t, {
    '../lib/entry-index': Object.assign({}, index, {
      hashKey: () => 'aaa',
    }),
  })

  t.plan(1)
  const CACHE = await mockCache(t)
  await index.insert(CACHE, 'foo', INTEGRITY, { metadata: 'foo' })
  const stats = await mockVerify(CACHE, { filter: () => null })
  t.same(
    {
      verifiedContent: stats.verifiedContent,
      rejectedEntries: stats.rejectedEntries,
      totalEntries: stats.totalEntries,
    },
    {
      verifiedContent: 0,
      rejectedEntries: 2,
      totalEntries: 0,
    },
    'should resolve while also excluding filtered out entries'
  )
})
