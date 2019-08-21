'use strict'

const BB = require('bluebird')

const CacheIndex = require('./util/cache-index')
const contentPath = require('../lib/content/path')
const fs = require('fs')
const path = require('path')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const readFile = BB.promisify(fs.readFile)

const CACHE = path.join(testDir, 'cache')
const index = require('../lib/entry-index')

const KEY = 'foo'
const BUCKET = index._bucketPath(CACHE, KEY)
const INTEGRITY = 'sha512-deadbeef'
const SIZE = 999

function opts (extra) {
  return Object.assign({
    size: SIZE
  }, extra)
}

test('basic insertion', function (t) {
  return index.insert(CACHE, KEY, INTEGRITY, opts({
    metadata: 'foo'
  })).then((entry) => {
    t.deepEqual(entry, {
      key: KEY,
      integrity: INTEGRITY,
      path: contentPath(CACHE, INTEGRITY),
      time: entry.time,
      metadata: 'foo',
      size: SIZE
    }, 'formatted entry returned')
    return readFile(BUCKET, 'utf8')
  }).then((data) => {
    t.equal(data[0], '\n', 'first entry starts with a \\n')
    const split = data.split('\t')
    t.equal(split[0].slice(1), index._hashEntry(split[1]), 'consistency header correct')
    const entry = JSON.parse(split[1])
    t.ok(entry.time, 'entry has a timestamp')
    t.deepEqual(entry, {
      key: KEY,
      integrity: INTEGRITY,
      time: entry.time,
      metadata: 'foo',
      size: SIZE
    }, 'entry matches what was inserted')
  })
})

test('inserts additional entries into existing key', function (t) {
  return index.insert(CACHE, KEY, INTEGRITY, opts({
    metadata: 1
  })).then(() => (
    index.insert(CACHE, KEY, INTEGRITY, opts({ metadata: 2 }))
  )).then(() => {
    return readFile(BUCKET, 'utf8')
  }).then((data) => {
    const entries = data.split('\n').slice(1).map(line => {
      return JSON.parse(line.split('\t')[1])
    })
    entries.forEach(function (e) { delete e.time })
    t.deepEqual(entries, [{
      key: KEY,
      integrity: INTEGRITY,
      metadata: 1,
      size: SIZE
    }, {
      key: KEY,
      integrity: INTEGRITY,
      metadata: 2,
      size: SIZE
    }], 'all entries present')
  })
})

test('separates entries even if one is corrupted', function (t) {
  // TODO - check that middle-of-string corrupted writes won't hurt.
  const fixture = new Tacks(CacheIndex({
    'foo': '\n' + JSON.stringify({
      key: KEY,
      integrity: 'meh',
      time: 54321,
      size: SIZE
    }) + '\n{"key": "' + KEY + '"\noway'
  }))
  fixture.create(CACHE)
  return index.insert(
    CACHE, KEY, INTEGRITY, opts()
  ).then(() => {
    return readFile(BUCKET, 'utf8')
  }).then((data) => {
    const entry = JSON.parse(data.split('\n')[4].split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: KEY,
      integrity: INTEGRITY,
      size: SIZE
    }, 'new entry unaffected by corruption')
  })
})

test('optional arbitrary metadata', function (t) {
  const metadata = { foo: 'bar' }
  return index.insert(
    CACHE, KEY, INTEGRITY, opts({ metadata: metadata })
  ).then(() => {
    return readFile(BUCKET, 'utf8')
  }).then((data) => {
    const entry = JSON.parse(data.split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: KEY,
      integrity: INTEGRITY,
      metadata: metadata,
      size: SIZE
    }, 'entry includes inserted metadata')
  })
})

test('key case-sensitivity', function (t) {
  return Promise.all([
    index.insert(CACHE, KEY, INTEGRITY, opts()),
    index.insert(CACHE, KEY.toUpperCase(), INTEGRITY + 'upper', opts())]
  ).then(() => {
    return Promise.all([
      index.find(CACHE, KEY),
      index.find(CACHE, KEY.toUpperCase())
    ]).then(([entry, upperEntry]) => {
      delete entry.time
      delete upperEntry.time
      t.deepEqual({
        key: entry.key,
        integrity: entry.integrity,
        size: SIZE
      }, {
        key: KEY,
        integrity: INTEGRITY,
        size: SIZE
      }, 'regular entry exists')
      t.deepEqual({
        key: upperEntry.key,
        integrity: upperEntry.integrity,
        size: SIZE
      }, {
        key: KEY.toUpperCase(),
        integrity: INTEGRITY + 'upper',
        size: SIZE
      }, 'case-variant entry intact')
    })
  })
})

test('path-breaking characters', function (t) {
  const newKey = ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?'
  return index.insert(
    CACHE, newKey, INTEGRITY, opts()
  ).then(() => {
    const bucket = index._bucketPath(CACHE, newKey)
    return readFile(bucket, 'utf8')
  }).then((data) => {
    const entry = JSON.parse(data.split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: newKey,
      integrity: INTEGRITY,
      size: SIZE
    }, 'entry exists and matches original key with invalid chars')
  })
})

test('extremely long keys', function (t) {
  let newKey = ''
  for (let i = 0; i < 10000; i++) {
    newKey += i
  }
  return index.insert(
    CACHE, newKey, INTEGRITY, opts()
  ).then(() => {
    const bucket = index._bucketPath(CACHE, newKey)
    return readFile(bucket, 'utf8')
  }).then((data) => {
    const entry = JSON.parse(data.split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: newKey,
      integrity: INTEGRITY,
      size: SIZE
    }, 'entry exists in spite of INCREDIBLY LONG key')
  })
})

test('concurrent writes')
test('correct ownership')
