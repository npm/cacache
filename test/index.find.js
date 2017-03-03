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
const contentPath = require('../lib/content/path')
const Dir = Tacks.Dir
const index = require('../lib/entry-index')

test('index.find cache hit', function (t) {
  const entry = {
    key: 'whatever',
    digest: 'deadbeef',
    hashAlgorithm: 'whatnot',
    time: 12345,
    metadata: 'omgsometa'
  }
  const fixture = new Tacks(CacheIndex({
    'whatever': entry
  }))
  fixture.create(CACHE)
  return index.find(
    CACHE, entry.key
  ).then(info => {
    t.ok(info, 'cache hit')
    t.equal(
      info.path,
      contentPath(CACHE, entry.digest, entry.hashAlgorithm),
      'path added to info'
    )
    delete info.path
    t.deepEqual(info, entry, 'rest of info matches entry on disk')
  })
})

test('index.find cache miss', function (t) {
  const fixture = new Tacks(CacheIndex({
    'foo': {key: 'foo'},
    'w/e': {key: 'w/e'}
  }))
  fixture.create(CACHE)
  return index.find(
    CACHE, 'whatever'
  ).then(info => {
    t.ok(!info, 'cache miss when specific key not present')
  })
})

test('index.find no cache', function (t) {
  return fs.statAsync(CACHE).then(() => {
    throw new Error('expected cache directory')
  }).catch(err => {
    t.assert(err, 'cache directory does not exist')
    return index.find(CACHE, 'whatever')
  }).then(info => {
    t.ok(!info, 'if there is no cache dir, behaves like a cache miss')
  })
})

test('index.find key case-sensitivity', function (t) {
  const fixture = new Tacks(CacheIndex({
    'jsonstream': {
      key: 'jsonstream',
      digest: 'lowercase',
      time: 54321
    },
    'JSONStream': {
      key: 'JSONStream',
      digest: 'capitalised',
      time: 12345
    }
  }))
  fixture.create(CACHE)
  return Promise.join(
    index.find(CACHE, 'JSONStream').then(info => {
      t.ok(info, 'found an entry for JSONStream')
      t.equal(info.key, 'JSONStream', 'fetched the correct entry')
    }),
    index.find(CACHE, 'jsonstream').then(info => {
      t.ok(info, 'found an entry for jsonstream')
      t.equal(info.key, 'jsonstream', 'fetched the correct entry')
    }),
    index.find(CACHE, 'jsonStream').then(info => {
      t.ok(!info, 'no entry for jsonStream')
    })
  )
})

test('index.find path-breaking characters', function (t) {
  const entry = {
    key: ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?',
    digest: 'deadbeef',
    time: 12345,
    hashAlgorithm: 'whatnot',
    metadata: 'omgsometa'
  }
  const fixture = new Tacks(CacheIndex({
    [entry.key]: entry
  }))
  fixture.create(CACHE)
  return index.find(CACHE, entry.key).then(info => {
    t.ok(info, 'cache hit')
    delete info.path
    t.deepEqual(
      info,
      entry,
      'info remains intact even with fs-unfriendly chars'
    )
  })
})

test('index.find extremely long keys', function (t) {
  let key = ''
  for (let i = 0; i < 10000; i++) {
    key += i
  }
  const entry = {
    key: key,
    digest: 'deadbeef',
    time: 12345,
    hashAlgorithm: 'whatnot',
    metadata: 'woo'
  }
  const fixture = new Tacks(CacheIndex({
    [entry.key]: entry
  }))
  fixture.create(CACHE)
  return index.find(CACHE, entry.key).then(info => {
    t.ok(info, 'cache hit')
    delete info.path
    t.deepEqual(
      info,
      entry,
      'info remains intact even with absurdly long key'
    )
  })
})

test('index.find multiple index entries for key', function (t) {
  const key = 'whatever'
  const fixture = new Tacks(CacheIndex({
    'whatever': [
      { key: key, digest: 'deadbeef', time: 54321 },
      { key: key, digest: 'bada55', time: 12345 }
    ]
  }))
  fixture.create(CACHE)
  return index.find(CACHE, key).then(info => {
    t.ok(info, 'cache hit')
    t.equal(info.digest, 'bada55', 'most recent entry wins')
  })
})

test('index.find garbled data in index file', function (t) {
  // Even though `index.insert()` is safe from direct
  // race conditions, it's still possible for individual
  // entries to become corrupted, or to be partially written,
  // since `index.find` does not acquire a write-preventing lock.
  //
  // Because entries are newline-prepended and only one
  // can be written at a time, the main possible corruption
  // source is if an append fails mid-write (for example, due
  // to the process crashing). In this case, the corrupt entry
  // will simply be skipped.
  const key = 'whatever'
  const stringified = JSON.stringify({
    key: key,
    digest: 'deadbeef',
    time: 54321
  })
  const fixture = new Tacks(CacheIndex({
    'whatever': '\n' +
    `${stringified.length}\t${stringified}` +
    '\n{"key": "' + key + '"\noway'
  }))
  fixture.create(CACHE)
  return index.find(CACHE, key).then(info => {
    t.ok(info, 'cache hit in spite of crash-induced fail')
    t.equal(info.digest, 'deadbeef', ' recent entry wins')
  })
})

test('index.find hash conflict in same bucket', function (t) {
  // This... is very unlikely to happen. But hey.
  const entry = {
    key: 'whatever',
    digest: 'deadbeef',
    hashAlgorithm: 'whatnot',
    time: 12345,
    metadata: 'yay'
  }
  const fixture = new Tacks(CacheIndex({
    'whatever': [
      { key: 'ohnoes', digest: 'welp!' },
      entry,
      { key: 'nope', digest: 'bada55' }
    ]
  }))
  fixture.create(CACHE)
  return index.find(CACHE, entry.key).then(info => {
    t.ok(info, 'cache hit')
    delete info.path
    t.deepEqual(
      info,
      entry,
      'got the right one even though different keys exist in index'
    )
  })
})
