'use strict'

const test = require('tap').test

const memo = require('../lib/memoization')

const CACHE = 'mycache'
const ENTRY = {
  key: 'foo',
  integrity: 'sha512-deadbeef',
  time: new Date(),
  metadata: null
}
const DATA = 'foobarbaz'

test('memoizes entry and data by key', t => {
  memo.put(CACHE, ENTRY, DATA)
  t.deepEqual(memo.clearMemoized(), {
    [`key:${CACHE}:${ENTRY.key}`]: {
      entry: ENTRY,
      data: DATA
    },
    [`digest:${CACHE}:${ENTRY.integrity}`]: DATA
  }, 'cache has both key and digest entries')
  t.done()
})

test('can fetch data by key', t => {
  memo.put(CACHE, ENTRY, DATA)
  t.deepEqual(memo.get(CACHE, ENTRY.key), {
    entry: ENTRY,
    data: DATA
  }, 'fetched data correctly')
  t.deepEqual(
    memo.get(CACHE + 'meh', ENTRY.key),
    null,
    'different caches store different keyspaces'
  )
  memo.clearMemoized()
  t.done()
})

test('can fetch data by digest', t => {
  memo.put(CACHE, ENTRY, DATA)
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity),
    DATA,
    'got raw data by digest, without an entry'
  )
  memo.clearMemoized()
  t.done()
})

test('can clear out the memoization cache', t => {
  memo.put(CACHE, ENTRY, DATA)
  memo.clearMemoized()
  t.deepEqual(
    memo.get(CACHE, ENTRY.key),
    null,
    'entry not there anymore'
  )
  t.deepEqual(
    memo.get.byDigest(ENTRY.integrity),
    null,
    'digest-based data not there anymore'
  )
  t.done()
})

test('accepts optional injected cache', t => {
  memo.clearMemoized()
  const MEMO = new Map()
  memo.put(CACHE, ENTRY, DATA, { memoize: MEMO })
  t.deepEqual(
    memo.get(CACHE, ENTRY.key),
    null,
    'entry not in global memo cache'
  )
  t.deepEqual(
    memo.get(CACHE, ENTRY.key, { memoize: MEMO }),
    { entry: ENTRY, data: DATA },
    'entry fetched from injected memoizer'
  )
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: MEMO }),
    DATA,
    'content entry fetched from injected memoizer'
  )
  t.deepEqual(
    MEMO.get(`key:${CACHE}:${ENTRY.key}`),
    { entry: ENTRY, data: DATA },
    'entry is in the injected memoizer'
  )
  t.deepEqual(
    MEMO.get(`digest:${CACHE}:${ENTRY.integrity}`),
    DATA,
    'content entry is in the injected memoizer'
  )
  MEMO.clear()
  t.deepEqual(
    memo.get(CACHE, ENTRY.key, { memoize: MEMO }),
    null,
    'tried to read from cleared memoizer'
  )
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: MEMO }),
    null,
    'tried to read by digest from cleared memoizer'
  )
  memo.put.byDigest(CACHE, ENTRY.integrity, DATA, { memoize: MEMO })
  t.deepEqual(
    MEMO.get(`digest:${CACHE}:${ENTRY.integrity}`),
    DATA,
    'content entry is in the injected memoizer'
  )
  const obj = {}
  memo.put(CACHE, ENTRY, DATA, { memoize: obj })
  t.deepEqual(
    memo.get(CACHE, ENTRY.key, { memoize: obj }),
    { entry: ENTRY, data: DATA },
    'entry fetched from injected object memoizer'
  )
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: MEMO }),
    DATA,
    'content entry fetched from injected object memoizer'
  )
  memo.clearMemoized()
  memo.put(CACHE, ENTRY, DATA, { memoize: 'foo' })
  t.deepEqual(
    memo.get(CACHE, ENTRY.key, { memoize: 'foo' }),
    { entry: ENTRY, data: DATA },
    'entry fetched from global memoization obj on non-obj option'
  )
  t.deepEqual(
    memo.get(CACHE, ENTRY.key, { memoize: 'foo' }),
    { entry: ENTRY, data: DATA },
    'entry fetched from global memoization obj on non-obj option'
  )
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: 'foo' }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: 'foo' }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: false }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.deepEqual(
    memo.get.byDigest(CACHE, ENTRY.integrity, { memoize: false }),
    DATA,
    'content entry fetched global memoizer obj on non-obj option'
  )
  t.done()
})
