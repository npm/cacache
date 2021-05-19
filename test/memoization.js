'use strict'

const { test } = require('tap')

const memo = require('../lib/memoization')

const CACHE = 'mycache'
const ENTRY = {
  key: 'foo',
  integrity: 'sha512-deadbeef',
  time: new Date(),
  metadata: null
}
const DATA = 'foobarbaz'

test('memoizes entry and data by key', (t) => {
  memo.put(CACHE, ENTRY, DATA)
  t.same(
    memo.clearMemoized(),
    {
      [`key:${CACHE}:${ENTRY.key}`]: {
        entry: ENTRY,
        data: DATA
      },
      [`digest:${CACHE}:${ENTRY.integrity}`]: DATA
    },
    'cache has both key and digest entries'
  )
  t.end()
})

test('can fetch data by key', (t) => {
  memo.put(CACHE, ENTRY, DATA)
  t.same(
    memo.get(CACHE, ENTRY.key),
    {
      entry: ENTRY,
      data: DATA
    },
    'fetched data correctly'
  )
  t.same(
    memo.get(CACHE + 'meh', ENTRY.key),
    null,
    'different caches store different keyspaces'
  )
  memo.clearMemoized()
  t.end()
})

test('can fetch data by digest', (t) => {
  memo.put(CACHE, ENTRY, DATA)
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity),
    DATA,
    'got raw data by digest, without an entry'
  )
  memo.clearMemoized()
  t.end()
})

test('can clear out the memoization cache', (t) => {
  memo.put(CACHE, ENTRY, DATA)
  memo.clearMemoized()
  t.same(memo.get(CACHE, ENTRY.key), null, 'entry not there anymore')
  t.same(
    memo.get.byDigest(ENTRY.integrity),
    null,
    'digest-based data not there anymore'
  )
  t.end()
})

test('accepts optional injected cache', (t) => {
  memo.clearMemoized()
  const MEMO = new Map()
  memo.put(CACHE, ENTRY, DATA, { memoize: MEMO })
  t.same(
    memo.get(CACHE, ENTRY.key),
    null,
    'entry not in global memo cache'
  )
  t.same(
    memo.get(CACHE, ENTRY.key, { memoize: MEMO }),
    { entry: ENTRY, data: DATA },
    'entry fetched from injected memoizer'
  )
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: MEMO }),
    DATA,
    'content entry fetched from injected memoizer'
  )
  t.same(
    MEMO.get(`key:${CACHE}:${ENTRY.key}`),
    { entry: ENTRY, data: DATA },
    'entry is in the injected memoizer'
  )
  t.same(
    MEMO.get(`digest:${CACHE}:${ENTRY.integrity}`),
    DATA,
    'content entry is in the injected memoizer'
  )
  MEMO.clear()
  t.same(
    memo.get(CACHE, ENTRY.key, { memoize: MEMO }),
    null,
    'tried to read from cleared memoizer'
  )
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: MEMO }),
    null,
    'tried to read by digest from cleared memoizer'
  )
  memo.put.byDigest(CACHE, ENTRY.integrity, DATA, { memoize: MEMO })
  t.same(
    MEMO.get(`digest:${CACHE}:${ENTRY.integrity}`),
    DATA,
    'content entry is in the injected memoizer'
  )
  const obj = {}
  memo.put(CACHE, ENTRY, DATA, { memoize: obj })
  t.same(
    memo.get(CACHE, ENTRY.key, { memoize: obj }),
    { entry: ENTRY, data: DATA },
    'entry fetched from injected object memoizer'
  )
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: MEMO }),
    DATA,
    'content entry fetched from injected object memoizer'
  )
  memo.clearMemoized()
  memo.put(CACHE, ENTRY, DATA, { memoize: 'foo' })
  t.same(
    memo.get(CACHE, ENTRY.key, { memoize: 'foo' }),
    { entry: ENTRY, data: DATA },
    'entry fetched from global memoization obj on non-obj option'
  )
  t.same(
    memo.get(CACHE, ENTRY.key, { memoize: 'foo' }),
    { entry: ENTRY, data: DATA },
    'entry fetched from global memoization obj on non-obj option'
  )
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: 'foo' }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: 'foo' }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: false }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.same(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: false }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.end()
})
