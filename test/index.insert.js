'use strict'

const util = require('util')

const CacheIndex = require('./util/cache-index')
const contentPath = require('../lib/content/path')
const fs = require('fs')
const t = require('tap')

const readFile = util.promisify(fs.readFile)

const index = require('../lib/entry-index')

const key = 'foo'
const integrity = 'sha512-deadbeef'
const size = 999

t.test('basic insertion', function (t) {
  const cache = t.testdir({})
  const bucket = index.bucketPath(cache, key)
  return index
    .insert(
      cache,
      key,
      integrity,
      {
        size,
        metadata: 'foo',
      }
    )
    .then((entry) => {
      t.same(
        entry,
        {
          key,
          integrity,
          path: contentPath(cache, integrity),
          time: entry.time,
          metadata: 'foo',
          size,
        },
        'formatted entry returned'
      )
      return readFile(bucket, 'utf8')
    })
    .then((data) => {
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
})

t.test('inserts additional entries into existing key', function (t) {
  const cache = t.testdir({})
  const bucket = index.bucketPath(cache, key)
  return index
    .insert(
      cache,
      key,
      integrity,
      {
        size,
        metadata: 1,
      }
    )
    .then(() => index.insert(cache, key, integrity, { size, metadata: 2 }))
    .then(() => {
      return readFile(bucket, 'utf8')
    })
    .then((data) => {
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
})

t.test('separates entries even if one is corrupted', function (t) {
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
  return index
    .insert(cache, key, integrity, { size })
    .then(() => readFile(bucket, 'utf8'))
    .then((data) => {
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
})

t.test('optional arbitrary metadata', function (t) {
  const cache = t.testdir({})
  const bucket = index.bucketPath(cache, key)
  const metadata = { foo: 'bar' }
  return index
    .insert(cache, key, integrity, { size, metadata: metadata })
    .then(() => {
      return readFile(bucket, 'utf8')
    })
    .then((data) => {
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
})

t.test('key case-sensitivity', function (t) {
  const cache = t.testdir({})
  return Promise.all([
    index.insert(cache, key, integrity, { size }),
    index.insert(cache, key.toUpperCase(), `${integrity}upper`, { size }),
  ]).then(() => {
    return Promise.all([
      index.find(cache, key),
      index.find(cache, key.toUpperCase()),
    ]).then(([entry, upperEntry]) => {
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
  })
})

t.test('path-breaking characters', function (t) {
  const cache = t.testdir({})
  const newKey = ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?'
  return index
    .insert(cache, newKey, integrity, { size })
    .then(() => {
      const bucket = index.bucketPath(cache, newKey)
      return readFile(bucket, 'utf8')
    })
    .then((data) => {
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
})

t.test('extremely long keys', function (t) {
  const cache = t.testdir({})
  let newKey = ''
  for (let i = 0; i < 10000; i++) {
    newKey += i
  }

  return index
    .insert(cache, newKey, integrity, { size })
    .then(() => {
      const bucket = index.bucketPath(cache, newKey)
      return readFile(bucket, 'utf8')
    })
    .then((data) => {
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
})

t.test('concurrent writes')
t.test('correct ownership')
