'use strict'

const CacheIndex = require('./util/cache-index')
const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

Promise.promisifyAll(fs)

const CACHE = path.join(testDir, 'cache')
const Dir = Tacks.Dir
const index = require('../lib/entry-index')

const KEY = 'foo'
const KEYHASH = index._hashKey(KEY)
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
      path: path.join(CACHE, 'content', DIGEST),
      time: entry.time,
      metadata: 'foo'
    }, 'formatted entry returned')
    const bucket = path.join(CACHE, 'index', KEYHASH)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    t.equal(data[0], '{', 'first entry starts with a {, not \\n')
    const entry = JSON.parse(data)
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
    const bucket = path.join(CACHE, 'index', KEYHASH)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entries = data.split('\n').map(JSON.parse)
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
  const fixture = new Tacks(Dir({
    'index': CacheIndex({
      'foo': '\n' + JSON.stringify({
        key: KEY,
        digest: 'meh',
        time: 54321
      }) + '\n{"key": "' + KEY + '"\noway'
    })
  }))
  fixture.create(CACHE)
  return index.insert(
    CACHE, KEY, DIGEST
  ).then(() => {
    const bucket = path.join(CACHE, 'index', KEYHASH)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data.split('\n')[4])
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
    const bucket = path.join(CACHE, 'index', KEYHASH)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data)
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
    index.insert(CACHE, KEY.toUpperCase(), DIGEST)
  ).then(() => {
    const bucket = path.join(CACHE, 'index', KEYHASH)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entries = data.split('\n').map(JSON.parse).sort(e => (
      e.key === KEY
      ? -1
      : 1
    ))
    entries.forEach(function (e) { delete e.time })
    t.deepEqual(entries, [{
      key: KEY,
      digest: DIGEST
    }, {
      key: KEY.toUpperCase(),
      digest: DIGEST
    }], 'all entries present')
  })
})

test('hash conflict in same bucket', function (t) {
  // NOTE - this test will break if `index._hashKey` changes its algorithm.
  //        Adapt to it accordingly.
  const NEWKEY = KEY + '!'
  const CONFLICTING = KEY + '!!!'
  return index.insert(
    CACHE, NEWKEY, DIGEST
  ).then(() => (
    index.insert(CACHE, CONFLICTING, DIGEST)
  )).then(() => {
    const bucket = path.join(CACHE, 'index', index._hashKey(NEWKEY))
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entries = data.split('\n').map(JSON.parse)
    entries.forEach(function (e) { delete e.time })
    t.deepEqual(entries, [{
      key: NEWKEY,
      digest: DIGEST
    }, {
      key: KEY + '!!!',
      digest: DIGEST
    }], 'multiple entries for conflicting keys in the same bucket')
  })
})

test('path-breaking characters', function (t) {
  const newKey = ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?'
  const newHash = index._hashKey(newKey)
  return index.insert(
    CACHE, newKey, DIGEST
  ).then(() => {
    const bucket = path.join(CACHE, 'index', newHash)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data)
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
  const newHash = index._hashKey(newKey)
  return index.insert(
    CACHE, newKey, DIGEST
  ).then(() => {
    const bucket = path.join(CACHE, 'index', newHash)
    return fs.readFileAsync(bucket, 'utf8')
  }).then(data => {
    const entry = JSON.parse(data)
    delete entry.time
    t.deepEqual(entry, {
      key: newKey,
      digest: DIGEST
    }, 'entry exists in spite of INCREDIBLY LONG key')
  })
})

test('concurrent writes')
test('correct ownership')
