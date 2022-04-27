'use strict'

const CacheIndex = require('./fixtures/cache-index')
const contentPath = require('../lib/content/path')
const index = require('../lib/entry-index.js')
const t = require('tap')

const { ls } = require('..')

t.test('basic listing', function (t) {
  const contents = {
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 234234,
    },
    whatnot: {
      key: 'whatnot',
      integrity: 'sha512-bada55',
      time: 54321,
      metadata: null,
      size: 425345345,
    },
  }
  const CACHE = t.testdir(CacheIndex(contents))
  contents.whatever.path = contentPath(CACHE, contents.whatever.integrity)
  contents.whatnot.path = contentPath(CACHE, contents.whatnot.integrity)
  return ls(CACHE)
    .then((listing) => {
      t.same(listing, contents, 'index contents correct')
    })
    .then(() => {
      const listing = {}
      const stream = ls.stream(CACHE)
      stream.on('data', (entry) => {
        listing[entry.key] = entry
      })
      return stream.promise().then(() => {
        t.same(listing, contents, 'ls is streamable')
      })
    })
})

t.test('separate keys in conflicting buckets', function (t) {
  const contents = {
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 5,
    },
    whatev: {
      key: 'whatev',
      integrity: 'sha512-bada55',
      time: 54321,
      metadata: null,
      size: 99234234,
    },
  }
  const CACHE = t.testdir(
    CacheIndex({
      // put both in the same bucket
      whatever: [contents.whatever, contents.whatev],
    })
  )
  contents.whatever.path = contentPath(CACHE, contents.whatever.integrity)
  contents.whatev.path = contentPath(CACHE, contents.whatev.integrity)
  return ls(CACHE).then((listing) => {
    t.same(listing, contents, 'index contents correct')
  })
})

t.test('works fine on an empty/missing cache', function (t) {
  const CACHE = t.testdir()
  return ls(CACHE).then((listing) => {
    t.same(listing, {}, 'returned an empty listing')
  })
})

t.test('ignores non-dir files', function (t) {
  const index = CacheIndex({
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 234234,
    },
  })
  index.garbage = 'hello world'
  const CACHE = t.testdir(index)
  return ls(CACHE).then((listing) => {
    t.equal(Object.keys(listing).length, 1, 'only 1 item in listing')
    t.equal(listing.whatever.key, 'whatever', 'only the correct entry listed')
  })
})

t.test('correctly ignores deleted entries', (t) => {
  const contents = {
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 234234,
    },
    whatnot: {
      key: 'whatnot',
      integrity: 'sha512-bada55',
      time: 54321,
      metadata: null,
      size: 425345345,
    },
    whatwhere: {
      key: 'whatwhere',
      integrity: 'sha512-bada55e5',
      time: 54321,
      metadata: null,
      size: 425345345,
    },
  }
  const CACHE = t.testdir(CacheIndex(contents))
  contents.whatever.path = contentPath(CACHE, contents.whatever.integrity)
  contents.whatnot.path = contentPath(CACHE, contents.whatnot.integrity)
  contents.whatwhere.path = contentPath(CACHE, contents.whatwhere.integrity)
  return index
    .delete(CACHE, 'whatnot')
    .then(() => ls(CACHE))
    .then((listing) =>
      t.same(
        listing,
        {
          whatever: contents.whatever,
          whatwhere: contents.whatwhere,
        },
        'index contents correct'
      )
    )
    .then(() => {
      const listing = {}
      const stream = ls.stream(CACHE)
      stream.on('data', (entry) => {
        listing[entry.key] = entry
      })
      return stream.promise().then(() =>
        t.same(
          listing,
          {
            whatever: contents.whatever,
            whatwhere: contents.whatwhere,
          },
          'ls is streamable'
        )
      )
    })
})
