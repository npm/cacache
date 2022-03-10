'use strict'

const fs = require('fs')
const path = require('path')

const ssri = require('ssri')
const Tacks = require('tacks')
const { test } = require('tap')
const requireInject = require('require-inject')

const index = require('../lib/entry-index')
const CacheContent = require('./util/cache-content')
const testDir = require('./util/test-dir')(__filename)

// defines reusable errors
const genericError = new Error('ERR')
genericError.code = 'ERR'
const missingFileError = new Error('ENOENT')
missingFileError.code = 'ENOENT'

// helpers
const CACHE = path.join(testDir, 'cache')
const CONTENT = Buffer.from('foobarbaz', 'utf8')
const INTEGRITY = ssri.fromData(CONTENT).toString()
const KEY = 'my-test-key'
const fixture = new Tacks(
  CacheContent({
    [INTEGRITY]: CONTENT,
  })
)
fixture.create(CACHE)

const getEntryIndex = (opts) => requireInject('../lib/entry-index', opts)
const getEntryIndexReadFileFailure = (err) => getEntryIndex({
  fs: Object.assign({}, fs, {
    readFile: (path, encode, cb) => {
      cb(err)
    },
    readFileSync: () => {
      throw genericError
    },
  }),
})
const getEntryIndexFixOwnerFailure = (err) => {
  const chownr = () => Promise.reject(err)
  chownr.sync = () => {
    throw err
  }
  return getEntryIndex({
    '../lib/util/fix-owner': {
      mkdirfix: require('../lib/util/fix-owner').mkdirfix,
      chownr,
    },
  })
}

test('compact', async (t) => {
  t.teardown(() => {
    index.delete.sync(CACHE, KEY)
  })
  await Promise.all([
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const bucket = index.bucketPath(CACHE, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  const compacted = await index.compact(CACHE, KEY, filter)
  t.equal(compacted.length, 2, 'should return only two entries')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 2, 'bucket was deduplicated')
})

test('compact: treats null integrity without validateEntry as a delete', async (t) => {
  t.teardown(() => {
    index.delete.sync(CACHE, KEY)
  })
  // this one does not use Promise.all because we want to be certain
  // things are written in the right order
  await index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } })
  await index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } })
  // this is a delete, revs 1, 2 and 3 will be omitted
  await index.insert(CACHE, KEY, null, { metadata: { rev: 3 } })
  await index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 4 } })

  const bucket = index.bucketPath(CACHE, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  const compacted = await index.compact(CACHE, KEY, filter)
  t.equal(compacted.length, 1, 'should return only one entry')
  t.equal(compacted[0].metadata.rev, 4, 'kept rev 4')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 1, 'bucket was deduplicated')
})

test('compact: leverages validateEntry to skip invalid entries', async (t) => {
  t.teardown(() => {
    index.delete.sync(CACHE, KEY)
  })
  await Promise.all([
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const bucket = index.bucketPath(CACHE, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const matchFn = (entryA, entryB) =>
    entryA.metadata.rev === entryB.metadata.rev
  const validateEntry = (entry) => entry.metadata.rev > 1
  const compacted = await index.compact(CACHE, KEY, matchFn, { validateEntry })
  t.equal(compacted.length, 1, 'should return only one entries')
  t.equal(compacted[0].metadata.rev, 2, 'kept the rev 2 entry')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 1, 'bucket was deduplicated')
})

test('compact: validateEntry allows for keeping null integrity', async (t) => {
  t.teardown(() => {
    index.delete.sync(CACHE, KEY)
  })
  await Promise.all([
    index.insert(CACHE, KEY, null, { metadata: { rev: 1 } }),
    index.insert(CACHE, KEY, null, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, null, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, null, { metadata: { rev: 1 } }),
  ])

  const bucket = index.bucketPath(CACHE, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const matchFn = (entryA, entryB) =>
    entryA.metadata.rev === entryB.metadata.rev
  const validateEntry = (entry) => entry.metadata.rev > 1
  const compacted = await index.compact(CACHE, KEY, matchFn, { validateEntry })
  t.equal(compacted.length, 1, 'should return only one entry')
  t.equal(compacted[0].metadata.rev, 2, 'kept the rev 2 entry')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 1, 'bucket was deduplicated')
})

test('compact: ENOENT in chownr does not cause failure', async (t) => {
  t.teardown(() => {
    index.delete.sync(CACHE, KEY)
  })
  await Promise.all([
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const { compact } = getEntryIndexFixOwnerFailure(missingFileError)
  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  const compacted = await compact(CACHE, KEY, filter)
  t.equal(compacted.length, 2, 'deduplicated')
})

test('compact: generic error in chownr does cause failure', async (t) => {
  t.teardown(() => {
    index.delete.sync(CACHE, KEY)
  })
  await Promise.all([
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const { compact } = getEntryIndexFixOwnerFailure(genericError)
  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  return t.rejects(compact(CACHE, KEY, filter), { code: 'ERR' }, 'promise rejected')
})

test('compact: error in moveFile removes temp', async (t) => {
  t.teardown(() => {
    index.delete.sync(CACHE, KEY)
  })
  await Promise.all([
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(CACHE, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const { compact } = getEntryIndex({
    '@npmcli/move-file': () => Promise.reject(new Error('foo')),
  })
  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  await t.rejects(compact(CACHE, KEY, filter), { message: 'foo' }, 'promise rejected')

  const tmpFiles = fs.readdirSync(path.join(CACHE, 'tmp'))
  t.equal(tmpFiles.length, 0, 'temp file is gone')
})

test('delete.sync: removes a cache entry', (t) => {
  t.plan(3)
  index.insert(CACHE, KEY, INTEGRITY)
    .then(index.ls(CACHE))
    .then(lsResults => {
      t.match(lsResults, { key: KEY }, 'should have entries')
    })
    .then(() => {
      t.equal(
        index.delete.sync(CACHE, KEY),
        null,
        'should return null on successful deletion'
      )
      return index.ls(CACHE)
    })
    .then(lsResults => {
      t.notOk(Object.keys(lsResults).length, 'should have no entries')
    })
})

test('delete.sync: removeFully deletes the index entirely', async (t) => {
  const bucket = index.bucketPath(CACHE, KEY)
  await index.insert(CACHE, KEY, INTEGRITY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 1, 'has an entry')

  // do a normal delete first, this appends a null integrity
  index.delete.sync(CACHE, KEY)
  const delEntries = await index.bucketEntries(bucket)
  t.equal(delEntries.length, 2, 'should now have 2 entries')
  t.equal(delEntries[1].integrity, null, 'has a null integrity last')

  // then a full delete
  index.delete.sync(CACHE, KEY, { removeFully: true })
  await t.rejects(
    index.bucketEntries(bucket),
    { code: 'ENOENT' },
    'rejects with ENOENT because file is gone'
  )
})

test('delete: removeFully deletes the index entirely', async (t) => {
  const bucket = index.bucketPath(CACHE, KEY)
  await index.insert(CACHE, KEY, INTEGRITY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 1, 'has an entry')

  // do a normal delete first, this appends a null integrity
  await index.delete(CACHE, KEY)
  const delEntries = await index.bucketEntries(bucket)
  t.equal(delEntries.length, 2, 'should now have 2 entries')
  t.equal(delEntries[1].integrity, null, 'has a null integrity last')

  // then a full delete
  await index.delete(CACHE, KEY, { removeFully: true })
  await t.rejects(
    index.bucketEntries(bucket),
    { code: 'ENOENT' },
    'rejects with ENOENT because file is gone'
  )
})

test('find: error on parsing json data', (t) => {
  // mocks readFile in order to return a borked json payload
  const { find } = getEntryIndex({
    fs: Object.assign({}, require('fs'), {
      readFile: (path, encode, cb) => {
        cb(null, '\ncec8d2e4685534ed189b563c8ee1cb1cb7c72874\t{"""// foo')
      },
    }),
  })

  t.plan(1)
  t.resolveMatch(
    find(CACHE, KEY),
    null,
    'should resolve with null'
  )
})

test('find: unknown error on finding entries', (t) => {
  const { find } = getEntryIndexReadFileFailure(genericError)

  t.plan(1)
  t.rejects(
    find(CACHE, KEY),
    genericError,
    'should reject with the unknown error thrown'
  )
})

test('find.sync: retrieve from bucket containing multiple entries', (t) => {
  const entries = [
    '\na7eb00332fe51ff62b1bdb1564855f2624f16f34\t{"key":"foo", "integrity": "foo"}',
    '\n46b1607f427665a99668c02d3a4cc52061afd83a\t{"key":"bar", "integrity": "bar"}',
  ]
  const { find } = getEntryIndex({
    fs: Object.assign({}, require('fs'), {
      readFileSync: (path, encode) => entries.join(''),
    }),
  })

  t.match(
    find.sync(CACHE, 'foo'),
    { key: 'foo' },
    'should retrieve entry using key'
  )
  t.end()
})

test('find.sync: unknown error on finding entries', (t) => {
  const { find } = getEntryIndexReadFileFailure(genericError)

  t.throws(
    () => find.sync(CACHE, KEY),
    genericError,
    'should throw the unknown error'
  )
  t.end()
})

test('find.sync: retrieve entry with invalid content', (t) => {
  const { find } = getEntryIndex({
    fs: Object.assign({}, require('fs'), {
      readFileSync: (path, encode) =>
        '\nb6589fc6ab0dc82cf12099d1c2d40ab994e8410c\t0',
    }),
  })

  t.match(
    find.sync(CACHE, 'foo'),
    null,
    'should return null'
  )
  t.end()
})

test('insert: missing files on fixing ownership', (t) => {
  const { insert } = getEntryIndexFixOwnerFailure(missingFileError)

  t.plan(1)
  t.resolves(
    insert(CACHE, KEY, INTEGRITY),
    'should insert entry with no errors'
  )
})

test('insert: unknown errors on fixing ownership', (t) => {
  const { insert } = getEntryIndexFixOwnerFailure(genericError)

  t.plan(1)
  t.rejects(
    insert(CACHE, KEY, INTEGRITY),
    genericError,
    'should throw the unknown error'
  )
})

test('insert.sync: missing files on fixing ownership', (t) => {
  const { insert } = getEntryIndexFixOwnerFailure(missingFileError)

  t.plan(1)
  t.doesNotThrow(
    () => insert.sync(CACHE, KEY, INTEGRITY),
    'should insert entry with no errors'
  )
})

test('insert.sync: unknown errors on fixing ownership', (t) => {
  const { insert } = getEntryIndexFixOwnerFailure(genericError)

  t.throws(
    () => insert.sync(CACHE, KEY, INTEGRITY),
    genericError,
    'should throw the unknown error'
  )
  t.end()
})

test('lsStream: unknown error reading files', (t) => {
  index.insert.sync(CACHE, KEY, INTEGRITY)

  const { lsStream } = getEntryIndexReadFileFailure(genericError)

  lsStream(CACHE)
    .on('error', err => {
      t.equal(err, genericError, 'should emit an error')
      t.end()
    })
})

test('lsStream: missing files error', (t) => {
  index.insert.sync(CACHE, KEY, INTEGRITY)

  const { lsStream } = getEntryIndexReadFileFailure(missingFileError)

  lsStream(CACHE)
    .on('error', () => {
      t.fail('should not error')
      t.end()
    })
    .on('end', () => {
      t.ok('should end successfully')
      t.end()
    })
})

test('lsStream: unknown error reading dirs', (t) => {
  const { lsStream } = getEntryIndex({
    fs: Object.assign({}, require('fs'), {
      readdir: (path, cb) => {
        cb(genericError)
      },
    }),
  })

  lsStream(CACHE)
    .on('error', err => {
      t.equal(err, genericError, 'should emit an error')
      t.end()
    })
})
