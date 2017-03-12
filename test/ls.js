'use strict'

const BB = require('bluebird')

const CacheIndex = require('./util/cache-index')
const finished = BB.promisify(require('mississippi').finished)
const path = require('path')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const CACHE = path.join(testDir, 'cache')
const contentPath = require('../lib/content/path')

const ls = require('..').ls

test('basic listing', function (t) {
  const contents = {
    'whatever': {
      key: 'whatever',
      digest: 'deadbeef',
      hashAlgorithm: 'whatnot',
      time: 12345,
      metadata: 'omgsometa'
    },
    'whatnot': {
      key: 'whatnot',
      digest: 'bada55',
      hashAlgorithm: 'whateva',
      time: 54321,
      metadata: null
    }
  }
  const fixture = new Tacks(CacheIndex(contents))
  contents.whatever.path =
    contentPath(
      CACHE, contents.whatever.digest, contents.whatever.hashAlgorithm)
  contents.whatnot.path =
    contentPath(
      CACHE, contents.whatnot.digest, contents.whatnot.hashAlgorithm)
  fixture.create(CACHE)
  return ls(CACHE).then(listing => {
    t.deepEqual(listing, contents, 'index contents correct')
  }).then(() => {
    const listing = []
    const stream = ls.stream(CACHE)
    stream.on('data', entry => {
      listing[entry.key] = entry
    })
    return finished(stream).then(() => {
      t.deepEqual(listing, contents, 'ls is streamable')
    })
  })
})

test('separate keys in conflicting buckets', function (t) {
  const contents = {
    'whatever': {
      key: 'whatever',
      digest: 'deadbeef',
      hashAlgorithm: 'whatnot',
      time: 12345,
      metadata: 'omgsometa'
    },
    'whatev': {
      key: 'whatev',
      digest: 'bada55',
      hashAlgorithm: 'whateva',
      time: 54321,
      metadata: null
    }
  }
  const fixture = new Tacks(CacheIndex({
    // put both in the same bucket
    'whatever': [contents.whatever, contents.whatev]
  }))
  contents.whatever.path =
    contentPath(
      CACHE, contents.whatever.digest, contents.whatever.hashAlgorithm)
  contents.whatev.path =
    contentPath(
      CACHE, contents.whatev.digest, contents.whatev.hashAlgorithm)
  fixture.create(CACHE)
  return ls(CACHE).then(listing => {
    t.deepEqual(listing, contents, 'index contents correct')
  })
})

test('works fine on an empty/missing cache', function (t) {
  return ls(CACHE).then(listing => {
    t.deepEqual(listing, {})
  })
})
