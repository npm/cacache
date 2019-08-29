'use strict'

const util = require('util')

const CacheIndex = require('./util/cache-index')
const contentPath = require('../lib/content/path')
const finished = util.promisify(require('mississippi').finished)
const index = require('../lib/entry-index.js')
const path = require('path')
const Tacks = require('tacks')
const { test } = require('tap')
const testDir = require('./util/test-dir')(__filename)

const CACHE = path.join(testDir, 'cache')
const File = Tacks.File

const { ls } = require('..')

test('basic listing', function (t) {
  const contents = {
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 234234
    },
    whatnot: {
      key: 'whatnot',
      integrity: 'sha512-bada55',
      time: 54321,
      metadata: null,
      size: 425345345
    }
  }
  const fixture = new Tacks(CacheIndex(contents))
  contents.whatever.path = contentPath(CACHE, contents.whatever.integrity)
  contents.whatnot.path = contentPath(CACHE, contents.whatnot.integrity)
  fixture.create(CACHE)
  return ls(CACHE)
    .then((listing) => {
      t.deepEqual(listing, contents, 'index contents correct')
    })
    .then(() => {
      const listing = []
      const stream = ls.stream(CACHE)
      stream.on('data', (entry) => {
        listing[entry.key] = entry
      })
      return finished(stream).then(() => {
        t.deepEqual(listing, contents, 'ls is streamable')
      })
    })
})

test('separate keys in conflicting buckets', function (t) {
  const contents = {
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 5
    },
    whatev: {
      key: 'whatev',
      integrity: 'sha512-bada55',
      time: 54321,
      metadata: null,
      size: 99234234
    }
  }
  const fixture = new Tacks(
    CacheIndex({
      // put both in the same bucket
      whatever: [contents.whatever, contents.whatev]
    })
  )
  contents.whatever.path = contentPath(CACHE, contents.whatever.integrity)
  contents.whatev.path = contentPath(CACHE, contents.whatev.integrity)
  fixture.create(CACHE)
  return ls(CACHE).then((listing) => {
    t.deepEqual(listing, contents, 'index contents correct')
  })
})

test('works fine on an empty/missing cache', function (t) {
  return ls(CACHE).then((listing) => {
    t.deepEqual(listing, {}, 'returned an empty listing')
  })
})

test('ignores non-dir files', function (t) {
  const index = CacheIndex({
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 234234
    }
  })
  index.contents.garbage = File('hello world')
  const fixture = new Tacks(index)
  fixture.create(CACHE)
  return ls(CACHE).then((listing) => {
    t.equal(Object.keys(listing).length, 1, 'only 1 item in listing')
    t.equal(listing.whatever.key, 'whatever', 'only the correct entry listed')
  })
})

test('correctly ignores deleted entries', (t) => {
  const contents = {
    whatever: {
      key: 'whatever',
      integrity: 'sha512-deadbeef',
      time: 12345,
      metadata: 'omgsometa',
      size: 234234
    },
    whatnot: {
      key: 'whatnot',
      integrity: 'sha512-bada55',
      time: 54321,
      metadata: null,
      size: 425345345
    },
    whatwhere: {
      key: 'whatwhere',
      integrity: 'sha512-bada55e5',
      time: 54321,
      metadata: null,
      size: 425345345
    }
  }
  const fixture = new Tacks(CacheIndex(contents))
  contents.whatever.path = contentPath(CACHE, contents.whatever.integrity)
  contents.whatnot.path = contentPath(CACHE, contents.whatnot.integrity)
  contents.whatwhere.path = contentPath(CACHE, contents.whatwhere.integrity)
  fixture.create(CACHE)
  return index
    .delete(CACHE, 'whatnot')
    .then(() => ls(CACHE))
    .then((listing) =>
      t.deepEqual(
        listing,
        {
          whatever: contents.whatever,
          whatwhere: contents.whatwhere
        },
        'index contents correct'
      )
    )
    .then(() => {
      const listing = []
      const stream = ls.stream(CACHE)
      stream.on('data', (entry) => {
        listing[entry.key] = entry
      })
      return finished(stream).then(() =>
        t.deepEqual(
          listing,
          {
            whatever: contents.whatever,
            whatwhere: contents.whatwhere
          },
          'ls is streamable'
        )
      )
    })
})
