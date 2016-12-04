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

test('basic listing', function (t) {
  var contents = {
    'whatever': {
      key: 'whatever',
      digest: 'deadbeef',
      time: 12345,
      metadata: 'omgsometa'
    },
    'whatnot': {
      key: 'whatnot',
      digest: 'bada55',
      time: 54321,
      metadata: null
    }
  }
  var fixture = new Tacks(Dir({
    'index': CacheIndex(contents)
  }))
  contents.whatever.path =
    contentPath(CACHE, contents.whatever.digest)
  contents.whatnot.path =
    contentPath(CACHE, contents.whatnot.digest)
  fixture.create(CACHE)
  index.ls(CACHE, function (err, listing) {
    if (err) { throw err }
    t.deepEqual(listing, contents, 'index contents correct')
    t.end()
  })
})

test('separate keys in conflicting buckets', function (t) {
  var contents = {
    'whatever': {
      key: 'whatever',
      digest: 'deadbeef',
      time: 12345,
      metadata: 'omgsometa'
    },
    'whatev': {
      key: 'whatev',
      digest: 'bada55',
      time: 54321,
      metadata: null
    }
  }
  var fixture = new Tacks(Dir({
    'index': CacheIndex({
      // put both in the same bucket
      'whatever': [contents.whatever, contents.whatev]
    })
  }))
  contents.whatever.path =
    contentPath(CACHE, contents.whatever.digest)
  contents.whatev.path =
    contentPath(CACHE, contents.whatev.digest)
  fixture.create(CACHE)
  index.ls(CACHE, function (err, listing) {
    if (err) { throw err }
    t.deepEqual(listing, contents, 'index contents correct')
    t.end()
  })
})

test('works fine on an empty/missing cache', function (t) {
  index.ls(CACHE, function (err, listing) {
    if (err) { throw err }
    t.deepEqual(listing, {})
    t.end()
  })
})
