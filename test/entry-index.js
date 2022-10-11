'use strict'

const fs = require('@npmcli/fs')
const path = require('path')

const ssri = require('ssri')
const t = require('tap')

const index = require('../lib/entry-index')
const CacheContent = require('./fixtures/cache-content')

// defines reusable errors
const genericError = new Error('ERR')
genericError.code = 'ERR'
const missingFileError = new Error('ENOENT')
missingFileError.code = 'ENOENT'

const getEntryIndex = (t, opts) => t.mock('../lib/entry-index', opts)
const getEntryIndexReadFileFailure = (t, err) => getEntryIndex(t, {
  '@npmcli/fs': Object.assign({}, fs, {
    readFile: async (path, encode) => {
      throw err
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
  return getEntryIndex(t, {
    '../lib/util/fix-owner': {
      mkdirfix: require('../lib/util/fix-owner').mkdirfix,
      chownr,
    },
  })
}

// helpers
const CONTENT = Buffer.from('foobarbaz', 'utf8')
const INTEGRITY = ssri.fromData(CONTENT).toString()
const KEY = 'my-test-key'
const cacheContent = CacheContent({
  [INTEGRITY]: CONTENT,
})

t.test('compact', async (t) => {
  const cache = t.testdir(cacheContent)
  await Promise.all([
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const bucket = index.bucketPath(cache, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  const compacted = await index.compact(cache, KEY, filter)
  t.equal(compacted.length, 2, 'should return only two entries')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 2, 'bucket was deduplicated')
})

t.test('compact: treats null integrity without validateEntry as a delete', async (t) => {
  const cache = t.testdir(cacheContent)
  // this one does not use Promise.all because we want to be certain
  // things are written in the right order
  await index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } })
  await index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } })
  // this is a delete, revs 1, 2 and 3 will be omitted
  await index.insert(cache, KEY, null, { metadata: { rev: 3 } })
  await index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 4 } })

  const bucket = index.bucketPath(cache, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  const compacted = await index.compact(cache, KEY, filter)
  t.equal(compacted.length, 1, 'should return only one entry')
  t.equal(compacted[0].metadata.rev, 4, 'kept rev 4')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 1, 'bucket was deduplicated')
})

t.test('compact: leverages validateEntry to skip invalid entries', async (t) => {
  const cache = t.testdir(cacheContent)
  await Promise.all([
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const bucket = index.bucketPath(cache, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const matchFn = (entryA, entryB) =>
    entryA.metadata.rev === entryB.metadata.rev
  const validateEntry = (entry) => entry.metadata.rev > 1
  const compacted = await index.compact(cache, KEY, matchFn, { validateEntry })
  t.equal(compacted.length, 1, 'should return only one entries')
  t.equal(compacted[0].metadata.rev, 2, 'kept the rev 2 entry')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 1, 'bucket was deduplicated')
})

t.test('compact: validateEntry allows for keeping null integrity', async (t) => {
  const cache = t.testdir(cacheContent)
  await Promise.all([
    index.insert(cache, KEY, null, { metadata: { rev: 1 } }),
    index.insert(cache, KEY, null, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, null, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, null, { metadata: { rev: 1 } }),
  ])

  const bucket = index.bucketPath(cache, KEY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 4, 'started with 4 entries')

  const matchFn = (entryA, entryB) =>
    entryA.metadata.rev === entryB.metadata.rev
  const validateEntry = (entry) => entry.metadata.rev > 1
  const compacted = await index.compact(cache, KEY, matchFn, { validateEntry })
  t.equal(compacted.length, 1, 'should return only one entry')
  t.equal(compacted[0].metadata.rev, 2, 'kept the rev 2 entry')

  const newEntries = await index.bucketEntries(bucket)
  t.equal(newEntries.length, 1, 'bucket was deduplicated')
})

t.test('compact: ENOENT in chownr does not cause failure', async (t) => {
  const cache = t.testdir(cacheContent)
  await Promise.all([
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const { compact } = getEntryIndexFixOwnerFailure(missingFileError)
  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  const compacted = await compact(cache, KEY, filter)
  t.equal(compacted.length, 2, 'deduplicated')
})

t.test('compact: generic error in chownr does cause failure', async (t) => {
  const cache = t.testdir(cacheContent)
  await Promise.all([
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const { compact } = getEntryIndexFixOwnerFailure(genericError)
  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  return t.rejects(compact(cache, KEY, filter), { code: 'ERR' }, 'promise rejected')
})

t.test('compact: error in moveFile removes temp', async (t) => {
  const cache = t.testdir(cacheContent)
  await Promise.all([
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 2 } }),
    index.insert(cache, KEY, INTEGRITY, { metadata: { rev: 1 } }),
  ])

  const { compact } = getEntryIndex(t, {
    '@npmcli/move-file': () => Promise.reject(new Error('foo')),
  })
  const filter = (entryA, entryB) => entryA.metadata.rev === entryB.metadata.rev
  await t.rejects(compact(cache, KEY, filter), { message: 'foo' }, 'promise rejected')

  const tmpFiles = fs.readdirSync(path.join(cache, 'tmp'))
  t.equal(tmpFiles.length, 0, 'temp file is gone')
})

t.test('delete: removeFully deletes the index entirely', async (t) => {
  const cache = t.testdir(cacheContent)
  const bucket = index.bucketPath(cache, KEY)
  await index.insert(cache, KEY, INTEGRITY)
  const entries = await index.bucketEntries(bucket)
  t.equal(entries.length, 1, 'has an entry')

  // do a normal delete first, this appends a null integrity
  await index.delete(cache, KEY)
  const delEntries = await index.bucketEntries(bucket)
  t.equal(delEntries.length, 2, 'should now have 2 entries')
  t.equal(delEntries[1].integrity, null, 'has a null integrity last')

  // then a full delete
  await index.delete(cache, KEY, { removeFully: true })
  await t.rejects(
    index.bucketEntries(bucket),
    { code: 'ENOENT' },
    'rejects with ENOENT because file is gone'
  )
})

t.test('find: error on parsing json data', (t) => {
  const cache = t.testdir(cacheContent)
  // mocks readFile in order to return a borked json payload
  const { find } = getEntryIndex(t, {
    '@npmcli/fs': Object.assign({}, require('@npmcli/fs'), {
      readFile: async (path, encode) => {
        return '\ncec8d2e4685534ed189b563c8ee1cb1cb7c72874\t{"""// foo'
      },
    }),
  })

  t.plan(1)
  t.resolveMatch(
    find(cache, KEY),
    null,
    'should resolve with null'
  )
})

t.test('find: unknown error on finding entries', (t) => {
  const cache = t.testdir(cacheContent)
  const { find } = getEntryIndexReadFileFailure(t, genericError)

  t.plan(1)
  t.rejects(
    find(cache, KEY),
    genericError,
    'should reject with the unknown error thrown'
  )
})

t.test('insert: missing files on fixing ownership', (t) => {
  const cache = t.testdir(cacheContent)
  const { insert } = getEntryIndexFixOwnerFailure(missingFileError)

  t.plan(1)
  t.resolves(
    insert(cache, KEY, INTEGRITY),
    'should insert entry with no errors'
  )
})

t.test('insert: unknown errors on fixing ownership', (t) => {
  const cache = t.testdir(cacheContent)
  const { insert } = getEntryIndexFixOwnerFailure(genericError)

  t.plan(1)
  t.rejects(
    insert(cache, KEY, INTEGRITY),
    genericError,
    'should throw the unknown error'
  )
})

t.test('lsStream: unknown error reading files', async (t) => {
  const cache = t.testdir(cacheContent)
  await index.insert(cache, KEY, INTEGRITY)

  const { lsStream } = getEntryIndexReadFileFailure(t, genericError)

  return new Promise((resolve) => {
    lsStream(cache)
      .on('error', err => {
        t.equal(err, genericError, 'should emit an error')
        resolve()
      })
  })
})

t.test('lsStream: missing files error', async (t) => {
  const cache = t.testdir(cacheContent)
  await index.insert(cache, KEY, INTEGRITY)

  const { lsStream } = getEntryIndexReadFileFailure(t, missingFileError)

  return new Promise((resolve, reject) => {
    lsStream(cache)
      .on('error', reject)
      .on('end', resolve)
  })
})

t.test('lsStream: unknown error reading dirs', (t) => {
  const cache = t.testdir(cacheContent)
  const { lsStream } = getEntryIndex(t, {
    '@npmcli/fs': Object.assign({}, require('@npmcli/fs'), {
      readdir: async (path) => {
        throw genericError
      },
    }),
  })

  lsStream(cache)
    .on('error', err => {
      t.equal(err, genericError, 'should emit an error')
      t.end()
    })
})
