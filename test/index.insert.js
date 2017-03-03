'use strict'

const CacheIndex = require('./util/cache-index')
const contentPath = require('../lib/content/path')
const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

Promise.promisifyAll(fs)

const CACHE = path.join(testDir, 'cache')
const index = require('../lib/entry-index')

const KEY = 'foo'
const BUCKET = index._bucketPath(CACHE, KEY)
const DIGEST = 'deadbeef'
const ALGO = 'whatnot'

test('basic insertion', function (t) {
  return index.insert(
    CACHE, KEY, DIGEST, { metadata: 'foo', hashAlgorithm: ALGO }
  ).then(entry => {
    t.deepEqual(entry, {
      key: KEY,
      digest: DIGEST,
      hashAlgorithm: ALGO,
      path: contentPath(CACHE, DIGEST, ALGO),
      time: entry.time,
      metadata: 'foo'
    }, 'formatted entry returned')
    return fs.readFileAsync(BUCKET, 'utf8')
  }).then(data => {
    t.equal(data[0], '\n', 'first entry starts with a \\n')
    const split = data.split('\t')
    t.equal(parseInt(split[0], 10), split[1].length, 'length header correct')
    const entry = JSON.parse(split[1])
    t.ok(entry.time, 'entry has a timestamp')
    t.deepEqual(entry, {
      key: KEY,
      digest: DIGEST,
      hashAlgorithm: ALGO,
      time: entry.time,
      metadata: 'foo'
    }, 'entry matches what was inserted')
  })
})

test('inserts additional entries into existing key', function (t) {
  return index.insert(
    CACHE, KEY, DIGEST, {metadata: 1}
  ).then(() => (
    index.insert(CACHE, KEY, DIGEST, {metadata: 2})
  )).then(() => {
    return fs.readFileAsync(BUCKET, 'utf8')
  }).then(data => {
    const entries = data.split('\n').slice(1).map(line => {
      return JSON.parse(line.split('\t')[1])
    })
    entries.forEach(function (e) { delete e.time })
    t.deepEqual(entries, [{
      key: KEY,
      digest: DIGEST,
      metadata: 1
    }, {
      key: KEY,
      digest: DIGEST,
      metadata: 2
    }], 'all entries present')
  })
})

test('separates entries even if one is corrupted', function (t) {
  // TODO - check that middle-of-string corrupted writes won't hurt.
  const fixture = new Tacks(CacheIndex({
    'foo': '\n' + JSON.stringify({
      key: KEY,
      digest: 'meh',
      time: 54321
    }) + '\n{"key": "' + KEY + '"\noway'
  }))
  fixture.create(CACHE)
  return index.insert(
    CACHE, KEY, DIGEST
  ).then(() => {
    return fs.readFileAsync(BUCKET, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data.split('\n')[4].split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: KEY,
      digest: DIGEST
    }, 'new entry unaffected by corruption')
  })
})

test('optional arbitrary metadata', function (t) {
  const metadata = { foo: 'bar' }
  return index.insert(
    CACHE, KEY, DIGEST, { metadata: metadata }
  ).then(() => {
    return fs.readFileAsync(BUCKET, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data.split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: KEY,
      digest: DIGEST,
      metadata: metadata
    }, 'entry includes inserted metadata')
  })
})

test('key case-sensitivity', function (t) {
  return Promise.join(
    index.insert(CACHE, KEY, DIGEST),
    index.insert(CACHE, KEY.toUpperCase(), DIGEST + 'upper')
  ).then(() => {
    return Promise.join(
      index.find(CACHE, KEY),
      index.find(CACHE, KEY.toUpperCase()),
      (entry, upperEntry) => {
        delete entry.time
        delete upperEntry.time
        t.deepEqual({
          key: entry.key,
          digest: entry.digest
        }, {
          key: KEY,
          digest: DIGEST
        }, 'regular entry exists')
        t.deepEqual({
          key: upperEntry.key,
          digest: upperEntry.digest
        }, {
          key: KEY.toUpperCase(),
          digest: DIGEST + 'upper'
        }, 'case-variant entry intact')
      }
    )
  })
})

test('path-breaking characters', function (t) {
  const newKey = ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?'
  return index.insert(
    CACHE, newKey, DIGEST
  ).then(() => {
    const bucket = index._bucketPath(CACHE, newKey)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data.split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: newKey,
      digest: DIGEST
    }, 'entry exists and matches original key with invalid chars')
  })
})

test('extremely long keys', function (t) {
  let newKey = ''
  for (let i = 0; i < 10000; i++) {
    newKey += i
  }
  return index.insert(
    CACHE, newKey, DIGEST
  ).then(() => {
    const bucket = index._bucketPath(CACHE, newKey)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data.split('\t')[1])
    delete entry.time
    t.deepEqual(entry, {
      key: newKey,
      digest: DIGEST
    }, 'entry exists in spite of INCREDIBLY LONG key')
  })
})

test('concurrent writes')
test('correct ownership')
