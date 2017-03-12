'use strict'

const Buffer = require('safe-buffer').Buffer
const BB = require('bluebird')

const crypto = require('crypto')
const finished = BB.promisify(require('mississippi').finished)
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
  return BB.join(
    finished(stream).then(() => Buffer.from(buf)),
    read(CACHE, DIGEST),
    (fromStream, fromBulk) => {
      t.deepEqual(fromStream, CONTENT, 'stream data checks out')
      t.deepEqual(fromBulk, CONTENT, 'promise data checks out')
    }
  )
})

test('read: allows hashAlgorithm configuration', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
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
  return BB.join(
    finished(stream).then(() => Buffer.from(buf)),
    read(CACHE, DIGEST, {
      hashAlgorithm: HASH
    }),
    (fromStream, fromBulk) => {
      t.deepEqual(fromStream, CONTENT, 'stream used algorithm')
      t.deepEqual(fromBulk, CONTENT, 'promise used algorithm')
    }
  )
})

test('read: errors if content missing', function (t) {
  const stream = read.stream(CACHE, 'whatnot')
  stream.on('data', function (data) {
    throw new Error('unexpected data: ' + JSON.stringify(data))
  })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  return BB.join(
    finished(stream).catch({code: 'ENOENT'}, err => err),
    read(CACHE, 'whatnot').catch({code: 'ENOENT'}, err => err),
    (streamErr, bulkErr) => {
      t.equal(streamErr.code, 'ENOENT', 'stream got the right error')
      t.equal(bulkErr.code, 'ENOENT', 'bulk got the right error')
    }
  )
})

test('read: errors if content fails checksum', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const DIGEST = crypto.createHash('sha512').update(CONTENT).digest('hex')
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT.slice(3) // invalid contents!
  }))
  fixture.create(CACHE)
  const stream = read.readStream(CACHE, DIGEST)
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  return BB.join(
    finished(stream).catch({code: 'EBADCHECKSUM'}, err => err),
    read(CACHE, DIGEST).catch({code: 'EBADCHECKSUM'}, err => err),
    (streamErr, bulkErr) => {
      t.equal(streamErr.code, 'EBADCHECKSUM', 'stream got the right error')
      t.equal(bulkErr.code, 'EBADCHECKSUM', 'bulk got the right error')
    }
  )
})

test('read: errors if content size does not match size option', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const DIGEST = crypto.createHash('sha512').update(CONTENT).digest('hex')
  const fixture = new Tacks(CacheContent({
    [DIGEST]: CONTENT.slice(3) // bad size!
  }))
  fixture.create(CACHE)
  const stream = read.readStream(CACHE, DIGEST, { size: CONTENT.length })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  return BB.join(
    finished(stream).catch({code: 'EBADSIZE'}, err => err),
    read(CACHE, DIGEST, {
      size: CONTENT.length
    }).catch({code: 'EBADSIZE'}, err => err),
    (streamErr, bulkErr) => {
      t.equal(streamErr.code, 'EBADSIZE', 'stream got the right error')
      t.equal(bulkErr.code, 'EBADSIZE', 'bulk got the right error')
    }
  )
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
