'use strict'

const Buffer = require('safe-buffer').Buffer
const BB = require('bluebird')

const crypto = require('crypto')
const path = require('path')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const CACHE = path.join(testDir, 'cache')
const CacheContent = require('./util/cache-content')

const read = require('../lib/content/read')

test('read: returns a BB with cache content data', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const DIGEST = crypto.createHash('sha512').update(CONTENT).digest('hex')
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT
  }))
  fixture.create(CACHE)
  return read(CACHE, DIGEST).then(data => {
    t.deepEqual(data, CONTENT, 'cache contents read correctly')
  })
})

test('read.stream: returns a stream with cache content data', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const DIGEST = crypto.createHash('sha512').update(CONTENT).digest('hex')
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT
  }))
  fixture.create(CACHE)
  const stream = read.stream(CACHE, DIGEST)
  stream.on('error', function (e) { throw e })
  let buf = ''
  stream.on('data', function (data) { buf += data })
  stream.on('end', function () {
    t.ok(true, 'stream completed successfully')
    t.deepEqual(Buffer.from(buf), CONTENT, 'cache contents read correctly')
    t.end()
  })
})

test('read.stream: allows hashAlgorithm configuration', function (t) {
  const CONTENT = 'foobarbaz'
  const HASH = 'whirlpool'
  const DIGEST = crypto.createHash(HASH).update(CONTENT).digest('hex')
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT
  }, HASH))
  fixture.create(CACHE)
  const stream = read.stream(CACHE, DIGEST, { hashAlgorithm: HASH })
  stream.on('error', function (e) { throw e })
  let buf = ''
  stream.on('data', function (data) { buf += data })
  stream.on('end', function () {
    t.ok(true, 'stream completed successfully, off a sha512')
    t.deepEqual(buf, CONTENT, 'cache contents read correctly')
    t.end()
  })
})

test('read.stream: errors if content missing', function (t) {
  const stream = read.stream(CACHE, 'whatnot')
  stream.on('error', function (e) {
    t.ok(e, 'got an error!')
    t.equal(e.code, 'ENOENT', 'error uses ENOENT error code')
    t.end()
  })
  stream.on('data', function (data) {
    throw new Error('unexpected data: ' + JSON.stringify(data))
  })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
})

test('read.stream: errors if content fails checksum', function (t) {
  const CONTENT = 'foobarbaz'
  const DIGEST = crypto.createHash('sha512').update(CONTENT).digest('hex')
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT.slice(3) // invalid contents!
  }))
  fixture.create(CACHE)
  const stream = read.readStream(CACHE, DIGEST)
  stream.on('error', function (e) {
    t.ok(e, 'got an error!')
    t.equal(e.code, 'EBADCHECKSUM', 'error uses EBADCHECKSUM error code')
    t.end()
  })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
})

test('hasContent: returns true when a cache file exists', function (t) {
  const fixture = new Tacks(CacheContent({
    'deadbeef': ''
  }))
  fixture.create(CACHE)
  return BB.join(
    read.hasContent(CACHE, 'deadbeef').then(bool => {
      t.ok(bool, 'returned true for existing content')
    }),
    read.hasContent(CACHE, 'not-there').then(bool => {
      t.notOk(bool, 'returned false for missing content')
    })
  )
})
