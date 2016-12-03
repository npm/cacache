var CacheIndex = require('./util/cache-index')
var fs = require('fs')
var path = require('path')
var Tacks = require('tacks')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')
var Dir = Tacks.Dir
var index = require('../lib/entry-index')

var KEY = 'foo'
var KEYHASH = index._hashKey(KEY)
var DIGEST = 'deadbeef'

test('basic insertion', function (t) {
  index.insert(CACHE, KEY, DIGEST, function (err) {
    if (err) { throw err }
    var bucket = path.join(CACHE, 'index', KEYHASH)
    fs.readFile(bucket, 'utf8', function (err, data) {
      if (err) { throw err }
      t.equal(data[0], '{', 'first entry starts with a {, not \\n')
      var entry = JSON.parse(data)
      t.ok(entry.time, 'entry has a timestamp')
      delete entry.time
      t.deepEqual(entry, {
        key: KEY,
        digest: DIGEST
      }, 'entry matches what was inserted')
      t.end()
    })
  })
})

test('inserts additional entries into existing key', function (t) {
  index.insert(CACHE, KEY, DIGEST, {metadata: 1}, function (err) {
    if (err) { throw err }
    index.insert(CACHE, KEY, DIGEST, {metadata: 2}, function (err) {
      if (err) { throw err }
      var bucket = path.join(CACHE, 'index', KEYHASH)
      fs.readFile(bucket, 'utf8', function (err, data) {
        if (err) { throw err }
        var entries = data.split('\n').map(JSON.parse)
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
        t.end()
      })
    })
  })
})

test('separates entries even if one is corrupted', function (t) {
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
      'foo': '\n' + JSON.stringify({
        key: KEY,
        digest: 'meh',
        time: 54321
      }) + '\n{"key": "' + KEY + '"\noway'
    })
  }))
  fixture.create(CACHE)
  index.insert(CACHE, KEY, DIGEST, function (err) {
    if (err) { throw err }
    var bucket = path.join(CACHE, 'index', KEYHASH)
    fs.readFile(bucket, 'utf8', function (err, data) {
      if (err) { throw err }
      var entry = JSON.parse(data.split('\n')[4])
      delete entry.time
      t.deepEqual(entry, {
        key: KEY,
        digest: DIGEST
      }, 'new entry unaffected by corruption')
      t.end()
    })
  })
})

test('optional arbitrary metadata', function (t) {
  var metadata = { foo: 'bar' }
  index.insert(CACHE, KEY, DIGEST, { metadata: metadata }, function (err) {
    if (err) { throw err }
    var bucket = path.join(CACHE, 'index', KEYHASH)
    fs.readFile(bucket, 'utf8', function (err, data) {
      if (err) { throw err }
      var entry = JSON.parse(data)
      delete entry.time
      t.deepEqual(entry, {
        key: KEY,
        digest: DIGEST,
        metadata: metadata
      }, 'entry includes inserted metadata')
      t.end()
    })
  })
})

test('key case-sensitivity', function (t) {
  index.insert(CACHE, KEY, DIGEST, function (err) {
    if (err) { throw err }
    index.insert(CACHE, KEY.toUpperCase(), DIGEST, function (err) {
      if (err) { throw err }
      var bucket = path.join(CACHE, 'index', KEYHASH)
      fs.readFile(bucket, 'utf8', function (err, data) {
        if (err) { throw err }
        var entries = data.split('\n').map(JSON.parse)
        entries.forEach(function (e) { delete e.time })
        t.deepEqual(entries, [{
          key: KEY,
          digest: DIGEST
        }, {
          key: KEY.toUpperCase(),
          digest: DIGEST
        }], 'all entries present')
        t.end()
      })
    })
  })
})

test('hash conflict in same bucket', function (t) {
  // NOTE - this test will break if `index._hashKey` changes its algorithm.
  //        Adapt to it accordingly.
  var CONFLICTING = KEY + '!!!'
  index.insert(CACHE, KEY, DIGEST, function (err) {
    if (err) { throw err }
    index.insert(CACHE, CONFLICTING, DIGEST, function (err) {
      if (err) { throw err }
      var bucket = path.join(CACHE, 'index', KEYHASH)
      fs.readFile(bucket, 'utf8', function (err, data) {
        if (err) { throw err }
        var entries = data.split('\n').map(JSON.parse)
        entries.forEach(function (e) { delete e.time })
        t.deepEqual(entries, [{
          key: KEY,
          digest: DIGEST
        }, {
          key: CONFLICTING,
          digest: DIGEST
        }], 'multiple entries for conflicting keys in the same bucket')
        t.end()
      })
    })
  })
})

test('path-breaking characters', function (t) {
  var newKey = ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?'
  var newHash = index._hashKey(newKey)
  index.insert(CACHE, newKey, DIGEST, function (err) {
    if (err) { throw err }
    var bucket = path.join(CACHE, 'index', newHash)
    fs.readFile(bucket, 'utf8', function (err, data) {
      if (err) { throw err }
      var entry = JSON.parse(data)
      delete entry.time
      t.deepEqual(entry, {
        key: newKey,
        digest: DIGEST
      }, 'entry exists and matches original key with invalid chars')
      t.end()
    })
  })
})

test('extremely long keys', function (t) {
  var newKey = ''
  for (var i = 0; i < 10000; i++) {
    newKey += i
  }
  var newHash = index._hashKey(newKey)
  index.insert(CACHE, newKey, DIGEST, function (err) {
    if (err) { throw err }
    var bucket = path.join(CACHE, 'index', newHash)
    fs.readFile(bucket, 'utf8', function (err, data) {
      if (err) { throw err }
      var entry = JSON.parse(data)
      delete entry.time
      t.deepEqual(entry, {
        key: newKey,
        digest: DIGEST
      }, 'entry exists in spite of INCREDIBLY LONG key')
      t.end()
    })
  })
})

test('concurrent writes')
test('correct ownership')
