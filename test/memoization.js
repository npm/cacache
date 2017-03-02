'use strict'

const test = require('tap').test

const memo = require('../lib/memoization')

const CACHE = 'mycache'
const ENTRY = {
  key: 'foo',
  digest: 'deadbeef',
  hashAlgorithm: 'sha512',
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
    [`digest:${CACHE}:${ENTRY.hashAlgorithm}:${ENTRY.digest}`]: DATA
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
    memo.get.byDigest(CACHE, ENTRY.digest, ENTRY.hashAlgorithm),
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
    memo.get.byDigest(ENTRY.digest),
    null,
    'digest-based data not there anymore'
  )
  t.done()
})
