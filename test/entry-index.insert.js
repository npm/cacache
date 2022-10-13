'use strict'

const CacheIndex = require('./fixtures/cache-index')
const contentPath = require('../lib/content/path')
const fs = require('fs/promises')
const t = require('tap')

const index = require('../lib/entry-index')

const key = 'foo'
const integrity = 'sha512-deadbeef'
const size = 999

t.test('basic insertion', async t => {
  const cache = t.testdir({})
  const bucket = index.bucketPath(cache, key)
  const insertEntry = await index.insert(cache, key, integrity, { size, metadata: 'foo' })
  t.same(
    insertEntry,
    {
      key,
      integrity,
      path: contentPath(cache, integrity),
      time: insertEntry.time,
      metadata: 'foo',
      size,
    },
    'formatted entry returned'
  )
  const data = await fs.readFile(bucket, 'utf8')
  t.equal(data[0], '\n', 'first entry starts with a \\n')
  const split = data.split('\t')
  t.equal(
    split[0].slice(1),
    index.hashEntry(split[1]),
    'consistency header correct'
  )
  const entry = JSON.parse(split[1])
  t.ok(entry.time, 'entry has a timestamp')
  t.same(
    entry,
    {
      key,
      integrity,
      time: entry.time,
      metadata: 'foo',
      size,
    },
    'entry matches what was inserted'
  )
})

t.test('inserts additional entries into existing key', async t => {
  const cache = t.testdir({})
  const bucket = index.bucketPath(cache, key)
  await index.insert(cache, key, integrity, { size, metadata: 1 })
  await index.insert(cache, key, integrity, { size, metadata: 2 })
  const data = await fs.readFile(bucket, 'utf8')
  const entries = data
    .split('\n')
    .slice(1)
    .map((line) => {
      return JSON.parse(line.split('\t')[1])
    })
  entries.forEach(function (e) {
    delete e.time
  })
  t.same(
    entries,
    [
      {
        key,
        integrity,
        metadata: 1,
        size,
      },
      {
        key,
        integrity,
        metadata: 2,
        size,
      },
    ],
    'all entries present'
  )
})

t.test('separates entries even if one is corrupted', async t => {
  // TODO - check that middle-of-string corrupted writes won't hurt.
  const cache = t.testdir(
    CacheIndex({
      foo:
        '\n' +
        JSON.stringify({
          key,
          integrity: 'meh',
          time: 54321,
          size,
        }) +
        '\n{"key": "' +
        key +
        '"\noway',
    })
  )
  const bucket = index.bucketPath(cache, key)
  await index.insert(cache, key, integrity, { size })
  const data = await fs.readFile(bucket, 'utf8')
  const entry = JSON.parse(data.split('\n')[4].split('\t')[1])
  delete entry.time
  t.same(
    entry,
    {
      key,
      integrity,
      size,
    },
    'new entry unaffected by corruption'
  )
})

t.test('optional arbitrary metadata', async t => {
  const cache = t.testdir({})
  const bucket = index.bucketPath(cache, key)
  const metadata = { foo: 'bar' }
  await index.insert(cache, key, integrity, { size, metadata: metadata })
  const data = await fs.readFile(bucket, 'utf8')
  const entry = JSON.parse(data.split('\t')[1])
  delete entry.time
  t.same(
    entry,
    {
      key,
      integrity,
      metadata: metadata,
      size,
    },
    'entry includes inserted metadata'
  )
})

t.test('key case-sensitivity', async t => {
  const cache = t.testdir({})
  await Promise.all([
    index.insert(cache, key, integrity, { size }),
    index.insert(cache, key.toUpperCase(), `${integrity}upper`, { size }),
  ])
  const [entry, upperEntry] = await Promise.all([
    index.find(cache, key),
    index.find(cache, key.toUpperCase()),
  ])
  delete entry.time
  delete upperEntry.time
  t.same(
    {
      key: entry.key,
      integrity: entry.integrity,
      size,
    },
    {
      key,
      integrity,
      size,
    },
    'regular entry exists'
  )
  t.same(
    {
      key: upperEntry.key,
      integrity: upperEntry.integrity,
      size,
    },
    {
      key: key.toUpperCase(),
      integrity: `${integrity}upper`,
      size,
    },
    'case-variant entry intact'
  )
})

t.test('path-breaking characters', async t => {
  const cache = t.testdir({})
  const newKey = ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?'
  await index.insert(cache, newKey, integrity, { size })
  const bucket = index.bucketPath(cache, newKey)
  const data = await fs.readFile(bucket, 'utf8')
  const entry = JSON.parse(data.split('\t')[1])
  delete entry.time
  t.same(
    entry,
    {
      key: newKey,
      integrity,
      size,
    },
    'entry exists and matches original key with invalid chars'
  )
})

t.test('extremely long keys', async t => {
  const cache = t.testdir({})
  let newKey = ''
  for (let i = 0; i < 10000; i++) {
    newKey += i
  }

  await index.insert(cache, newKey, integrity, { size })
  const bucket = index.bucketPath(cache, newKey)
  const data = await fs.readFile(bucket, 'utf8')
  const entry = JSON.parse(data.split('\t')[1])
  delete entry.time
  t.same(
    entry,
    {
      key: newKey,
      integrity,
      size,
    },
    'entry exists in spite of INCREDIBLY LONG key'
  )
})

t.test('ENOENT from appendFile is ignored', async (t) => {
  const cache = t.testdir()

  const indexMocked = t.mock('../lib/entry-index.js', {
    'fs/promises': {
      ...fs,
      appendFile: async () => {
        throw Object.assign(new Error('fake enoent'), { code: 'ENOENT' })
      },
    },
  })

  await t.resolves(() => indexMocked.insert(cache, key, integrity, { size }))
})

t.test('generic error from appendFile rejects', async (t) => {
  const cache = t.testdir()

  const indexMocked = t.mock('../lib/entry-index.js', {
    'fs/promises': {
      ...fs,
      appendFile: async () => {
        throw Object.assign(new Error('fake eperm'), { code: 'EPERM' })
      },
    },
  })

  await t.rejects(() => indexMocked.insert(cache, key, integrity, { size }), { code: 'EPERM' })
})

t.test('concurrent writes')
