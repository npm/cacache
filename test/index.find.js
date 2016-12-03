var CacheIndex = require('./util/cache-index')
var fs = require('fs')
var path = require('path')
var Tacks = require('tacks')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')
var contentPath = require('../lib/content/path')
var Dir = Tacks.Dir
var index = require('../lib/entry-index')

test('index.find cache hit', function (t) {
  var entry = {
    key: 'whatever',
    digest: 'deadbeef',
    time: 12345,
    metadata: 'omgsometa'
  }
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
      'whatever': entry
    })
  }))
  fixture.create(CACHE)
  index.find(CACHE, entry.key, function (err, info) {
    if (err) { throw err }
    t.ok(info, 'cache hit')
    t.equal(info.path, contentPath(CACHE, entry.digest), 'path added to info')
    delete info.path
    t.deepEqual(info, entry, 'rest of info matches entry on disk')
    t.end()
  })
})

test('index.find cache miss', function (t) {
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
      'foo': {key: 'foo'},
      'w/e': {key: 'w/e'}
    })
  }))
  fixture.create(CACHE)
  index.find(CACHE, 'whatever', function (err, info) {
    if (err) { throw err }
    t.ok(!info, 'cache miss when specific key not present')
    t.end()
  })
})

test('index.find no cache', function (t) {
  fs.stat(CACHE, function (err) {
    t.assert(err, 'cache directory does not exist')
    index.find(CACHE, 'whatever', function (err, info) {
      if (err) { throw err }
      t.ok(!info, 'if there is no cache dir, behaves like a cache miss')
      t.end()
    })
  })
})

test('index.find key case-sensitivity', function (t) {
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
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
    })
  }))
  fixture.create(CACHE)
  t.plan(5)
  index.find(CACHE, 'JSONStream', function (err, info) {
    if (err) { throw err }
    t.ok(info, 'found an entry for JSONStream')
    t.equal(info.key, 'JSONStream', 'fetched the correct entry')
  })
  index.find(CACHE, 'jsonstream', function (err, info) {
    if (err) { throw err }
    t.ok(info, 'found an entry for jsonstream')
    t.equal(info.key, 'jsonstream', 'fetched the correct entry')
  })
  index.find(CACHE, 'jsonStream', function (err, info) {
    if (err) { throw err }
    t.ok(!info, 'no entry for jsonStream')
  })
})

test('index.find path-breaking characters', function (t) {
  var entry = {
    key: ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?',
    digest: 'deadbeef',
    time: 12345,
    metadata: 'omgsometa'
  }
  var idx = {}
  idx[entry.key] = entry
  var fixture = new Tacks(Dir({
    'index': CacheIndex(idx)
  }))
  fixture.create(CACHE)
  index.find(CACHE, entry.key, function (err, info) {
    if (err) { throw err }
    t.ok(info, 'cache hit')
    delete info.path
    t.deepEqual(
      info,
      entry,
      'info remains intact even with fs-unfriendly chars'
    )
    t.end()
  })
})

test('index.find multiple index entries for key', function (t) {
  var key = 'whatever'
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
      'whatever': [
        { key: key, digest: 'deadbeef', time: 54321 },
        { key: key, digest: 'bada55', time: 12345 }
      ]
    })
  }))
  fixture.create(CACHE)
  index.find(CACHE, key, function (err, info) {
    if (err) { throw err }
    t.ok(info, 'cache hit')
    t.equal(info.digest, 'bada55', 'most recent entry wins')
    t.end()
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
  var key = 'whatever'
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
      'whatever': '\n' + JSON.stringify({
        key: key,
        digest: 'deadbeef',
        time: 54321
      }) + '\n{"key": "' + key + '"\noway'
    })
  }))
  fixture.create(CACHE)
  index.find(CACHE, key, function (err, info) {
    if (err) { throw err }
    t.ok(info, 'cache hit in spite of crash-induced fail')
    t.equal(info.digest, 'deadbeef', ' recent entry wins')
    t.end()
  })
})

test('index.find hash conflict in same bucket', function (t) {
  // This... is very unlikely to happen. But hey.
  var entry = {
    key: 'whatever',
    digest: 'deadbeef',
    time: 12345,
    metadata: 'yay'
  }
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
      'whatever': [
        { key: 'ohnoes', digest: 'welp!' },
        entry,
        { key: 'nope', digest: 'bada55' }
      ]
    })
  }))
  fixture.create(CACHE)
  index.find(CACHE, entry.key, function (err, info) {
    if (err) { throw err }
    t.ok(info, 'cache hit')
    delete info.path
    t.deepEqual(
      info,
      entry,
      'got the right one even though different keys exist in index'
    )
    t.end()
  })
})
