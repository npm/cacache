'use strict'

const CacheIndex = require('./fixtures/cache-index')
const path = require('path')
const t = require('tap')

const SIZE = 999
const contentPath = require('../lib/content/path')
const index = require('../lib/entry-index')

t.test('index.find cache hit', async t => {
  const entry = {
    key: 'whatever',
    integrity: 'whatnot-deadbeef',
    time: 12345,
    metadata: 'omgsometa',
    size: 5,
  }
  const CACHE = t.testdir(
    CacheIndex({
      whatever: entry,
    })
  )
  const info = await index.find(CACHE, entry.key)
  t.ok(info, 'cache hit')
  t.equal(
    info.path,
    contentPath(CACHE, entry.integrity),
    'path added to info'
  )
  delete info.path
  t.same(info, entry, 'rest of info matches entry on disk')
})

t.test('index.find cache miss', async t => {
  const CACHE = t.testdir(
    CacheIndex({
      foo: { key: 'foo' },
      'w/e': { key: 'w/e' },
    })
  )
  await t.resolveMatch(
    index.find(CACHE, 'whatever'),
    null,
    'cache miss when specific key not present'
  )
})

t.test('index.find no cache', async t => {
  await t.resolveMatch(
    index.find(path.resolve('adirectorythatdoesnotexit'), 'whatever'),
    null,
    'if there is no cache dir, behaves like a cache miss'
  )
})

t.test('index.find key case-sensitivity', async t => {
  const CACHE = t.testdir(
    CacheIndex({
      jsonstream: {
        key: 'jsonstream',
        integrity: 'sha1-lowercase',
        time: 54321,
        size: SIZE,
      },
      JSONStream: {
        key: 'JSONStream',
        integrity: 'sha1-capitalised',
        time: 12345,
        size: SIZE,
      },
    })
  )
  await t.resolveMatch(
    index.find(CACHE, 'JSONStream'),
    { key: 'JSONStream' },
    'fetched the correct entry'
  )
  await t.resolveMatch(
    index.find(CACHE, 'jsonstream'),
    { key: 'jsonstream' },
    'fetched the correct entry'
  )
  await t.resolveMatch(
    index.find(CACHE, 'jsonStream'),
    null,
    'no entry for jsonStream'
  )
})

t.test('index.find path-breaking characters', async t => {
  const entry = {
    key: ';;!registry\nhttps://registry.npmjs.org/back \\ slash@Cool™?',
    integrity: 'sha1-deadbeef',
    time: 12345,
    metadata: 'omgsometa',
    size: 9,
  }
  const CACHE = t.testdir(
    CacheIndex({
      [entry.key]: entry,
    })
  )
  const info = await index.find(CACHE, entry.key)
  t.ok(info, 'cache hit')
  delete info.path
  t.same(
    info,
    entry,
    'info remains intact even with fs-unfriendly chars'
  )
})

t.test('index.find extremely long keys', async t => {
  let key = ''
  for (let i = 0; i < 10000; i++) {
    key += i
  }

  const entry = {
    key: key,
    integrity: 'sha1-deadbeef',
    time: 12345,
    metadata: 'woo',
    size: 10,
  }
  const CACHE = t.testdir(
    CacheIndex({
      [entry.key]: entry,
    })
  )
  const info = await index.find(CACHE, entry.key)
  t.ok(info, 'cache hit')
  delete info.path
  t.same(info, entry, 'info remains intact even with absurdly long key')
})

t.test('index.find multiple index entries for key', async t => {
  const key = 'whatever'
  const CACHE = t.testdir(
    CacheIndex({
      whatever: [
        { key: key, integrity: 'sha1-deadbeef', time: 54321 },
        { key: key, integrity: 'sha1-bada55', time: 12345 },
      ],
    })
  )
  const info = await index.find(CACHE, key)
  t.ok(info, 'cache hit')
  t.equal(info.integrity, 'sha1-bada55', 'most recent entry wins')
})

t.test('index.find garbled data in index file', async t => {
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
    integrity: 'sha1-deadbeef',
    time: 54321,
  })
  const CACHE = t.testdir(
    CacheIndex({
      whatever:
        '\n' +
        `${index.hashEntry(stringified)}\t${stringified}` +
        '\n{"key": "' +
        key +
        '"\noway',
    })
  )
  const info = await index.find(CACHE, key)
  t.ok(info, 'cache hit in spite of crash-induced fail')
  t.equal(info.integrity, 'sha1-deadbeef', ' recent entry wins')
})

t.test('index.find hash conflict in same bucket', async t => {
  // This... is very unlikely to happen. But hey.
  const entry = {
    key: 'whatever',
    integrity: 'sha1-deadbeef',
    time: 12345,
    metadata: 'yay',
    size: 8,
  }
  const CACHE = t.testdir(
    CacheIndex({
      whatever: [
        { key: 'ohnoes', integrity: 'sha1-welp!' },
        entry,
        { key: 'nope', integrity: 'sha1-bada55' },
      ],
    })
  )
  const info = await index.find(CACHE, entry.key)
  t.ok(info, 'cache hit')
  delete info.path
  t.same(
    info,
    entry,
    'got the right one even though different keys exist in index'
  )
})
