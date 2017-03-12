'use strict'

const Buffer = require('safe-buffer').Buffer
const BB = require('bluebird')

const crypto = require('crypto')
const fromString = require('./util/from-string')
const fs = BB.promisifyAll(require('fs'))
const index = require('../lib/entry-index')
const memo = require('../lib/memoization')
const path = require('path')
const pipe = BB.promisify(require('mississippi').pipe)
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const CacheContent = require('./util/cache-content')
const CACHE = path.join(testDir, 'cache')
const CONTENT = Buffer.from('foobarbaz')
const KEY = 'my-test-key'
const ALGO = 'sha512'
const DIGEST = crypto.createHash(ALGO).update(CONTENT).digest('hex')
const METADATA = { foo: 'bar' }
const contentPath = require('../lib/content/path')

const get = require('..').get

const rm = require('..').rm

test('rm.entry removes entries, not content', t => {
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT
  }, ALGO))
  fixture.create(CACHE)
  return index.insert(CACHE, KEY, DIGEST, {
    metadata: METADATA,
    hashAlgorithm: ALGO
  }).then(() => {
    t.equal(rm, rm.entry, 'rm is an alias for rm.entry')
    return rm.entry(CACHE, KEY)
  }).then(() => {
    return get(CACHE, KEY)
  }).then(res => {
    throw new Error('unexpected success')
  }).catch({code: 'ENOENT'}, err => {
    t.match(err.message, /not found/, 'entry no longer accessible')
  }).then(() => {
    return fs.readFileAsync(contentPath(CACHE, DIGEST, ALGO))
  }).then(data => {
    t.deepEqual(data, CONTENT, 'content remains in cache')
  })
})

test('rm.content removes content, not entries', t => {
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT
  }, ALGO))
  fixture.create(CACHE)
  return index.insert(CACHE, KEY, DIGEST, {
    metadata: METADATA,
    hashAlgorithm: ALGO
  }).then(() => {
    return rm.content(CACHE, DIGEST)
  }).then(() => {
    return get(CACHE, KEY)
  }).then(res => {
    throw new Error('unexpected success')
  }).catch({code: 'ENOENT'}, err => {
    t.match(err.message, /no such file/, 'entry no longer accessible')
  }).then(() => {
    return fs.readFileAsync(contentPath(CACHE, DIGEST, ALGO))
  }).then(() => {
    throw new Error('unexpected success')
  }).catch({code: 'ENOENT'}, err => {
    t.match(err.message, /no such file/, 'content gone')
  })
})

test('rm.all deletes content and index dirs', t => {
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT
  }, ALGO))
  fixture.create(CACHE)
  return index.insert(CACHE, KEY, DIGEST, {
    metadata: METADATA,
    hashAlgorithm: ALGO
  }).then(() => {
    return fs.mkdirAsync(path.join(CACHE, 'tmp'))
  }).then(() => {
    return fs.writeFileAsync(path.join(CACHE, 'other.js'), 'hi')
  }).then(() => {
    return rm.all(CACHE)
  }).then(() => {
    return fs.readdirAsync(CACHE)
  }).then(files => {
    t.deepEqual(files.sort(), [
      'other.js',
      'tmp'
    ], 'removes content and index directories without touching other stuff')
  })
})
