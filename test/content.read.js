'use strict'

const BB = require('bluebird')

const finished = BB.promisify(require('mississippi').finished)
const fs = require('fs')
const path = require('path')
const ssri = require('ssri')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

BB.promisifyAll(fs)

const CACHE = path.join(testDir, 'cache')
const CacheContent = require('./util/cache-content')

const read = require('../lib/content/read')

test('read: returns a BB with cache content data', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  return read(CACHE, INTEGRITY).then(data => {
    t.deepEqual(data, CONTENT, 'cache contents read correctly')
  })
})

test('read.sync: reads synchronously', t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  const data = read.sync(CACHE, INTEGRITY)
  t.deepEqual(data, CONTENT, 'cache contents read correctly')
  t.done()
})

test('read.stream: returns a stream with cache content data', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  const stream = read.stream(CACHE, INTEGRITY)
  stream.on('error', function (e) { throw e })
  let buf = ''
  stream.on('data', function (data) { buf += data })
  return BB.join(
    finished(stream).then(() => Buffer.from(buf)),
    read(CACHE, INTEGRITY, { size: CONTENT.length }),
    (fromStream, fromBulk) => {
      t.deepEqual(fromStream, CONTENT, 'stream data checks out')
      t.deepEqual(fromBulk, CONTENT, 'promise data checks out')
    }
  )
})

test('read: allows hashAlgorithm configuration', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const HASH = 'whirlpool'
  const INTEGRITY = ssri.fromData(CONTENT, { algorithms: [HASH] })
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  const stream = read.stream(CACHE, INTEGRITY)
  stream.on('error', function (e) { throw e })
  let buf = ''
  stream.on('data', function (data) { buf += data })
  return BB.join(
    finished(stream).then(() => Buffer.from(buf)),
    read(CACHE, INTEGRITY),
    (fromStream, fromBulk) => {
      t.deepEqual(fromStream, CONTENT, 'stream used algorithm')
      t.deepEqual(fromBulk, CONTENT, 'promise used algorithm')
    }
  )
})

test('read: errors if content missing', function (t) {
  const stream = read.stream(CACHE, 'sha512-whatnot')
  stream.on('data', function (data) {
    throw new Error('unexpected data: ' + JSON.stringify(data))
  })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  return BB.join(
    finished(stream).catch({ code: 'ENOENT' }, err => err),
    read(CACHE, 'sha512-whatnot').catch({ code: 'ENOENT' }, err => err),
    (streamErr, bulkErr) => {
      t.equal(streamErr.code, 'ENOENT', 'stream got the right error')
      t.equal(bulkErr.code, 'ENOENT', 'bulk got the right error')
    }
  )
})

test('read: errors if content fails checksum', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT.slice(3) // invalid contents!
  }))
  fixture.create(CACHE)
  const stream = read.readStream(CACHE, INTEGRITY)
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  return BB.join(
    finished(stream).catch({ code: 'EINTEGRITY' }, err => err),
    read(CACHE, INTEGRITY).catch({ code: 'EINTEGRITY' }, err => err),
    (streamErr, bulkErr) => {
      t.equal(streamErr.code, 'EINTEGRITY', 'stream got the right error')
      t.equal(bulkErr.code, 'EINTEGRITY', 'bulk got the right error')
    }
  )
})

test('read: errors if content size does not match size option', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT.slice(3) // invalid contents!
  }))
  fixture.create(CACHE)
  const stream = read.readStream(CACHE, INTEGRITY, { size: CONTENT.length })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  return BB.join(
    finished(stream).catch({ code: 'EBADSIZE' }, err => err),
    read(CACHE, INTEGRITY, {
      size: CONTENT.length
    }).catch({ code: 'EBADSIZE' }, err => err),
    (streamErr, bulkErr) => {
      t.equal(streamErr.code, 'EBADSIZE', 'stream got the right error')
      t.equal(bulkErr.code, 'EBADSIZE', 'bulk got the right error')
    }
  )
})

test('hasContent: tests content existence', t => {
  const fixture = new Tacks(CacheContent({
    'sha1-deadbeef': ''
  }))
  fixture.create(CACHE)
  return BB.join(
    read.hasContent(CACHE, 'sha1-deadbeef')
      .then(content => {
        t.ok(content.sri, 'returned sri for this content')
        t.equal(content.size, 0, 'returned the right size for this content')
        t.ok(content.stat.isFile(), 'returned actual stat object')
      }),
    read.hasContent(CACHE, 'sha1-not-there')
      .then(content => {
        t.equal(content, false, 'returned false for missing content')
      }),
    read.hasContent(CACHE, 'sha1-not-here sha1-also-not-here')
      .then(content => {
        t.equal(content, false, 'multi-content hash failures work ok')
      })
  )
})

test('hasContent.sync: checks content existence synchronously', t => {
  const fixture = new Tacks(CacheContent({
    'sha1-deadbeef': ''
  }))
  fixture.create(CACHE)
  const content = read.hasContent.sync(CACHE, 'sha1-deadbeef')
  t.ok(content.sri, 'returned sri for this content')
  t.equal(content.size, 0, 'returned the right size for this content')
  t.ok(content.stat.isFile(), 'returned actual stat object')
  t.equal(
    read.hasContent.sync(CACHE, 'sha1-not-there'),
    false,
    'returned false for missing content'
  )
  t.equal(
    read.hasContent.sync(CACHE, 'sha1-not-here sha1-also-not-here'),
    false,
    'multi-content hash failures work ok'
  )
  t.done()
})

test('copy: copies content to a destination path', {
  skip: !fs.copyFile && 'Not supported on node versions without fs.copyFile'
}, t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const DEST = path.join(CACHE, 'foobar-file')
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  return read.copy(CACHE, INTEGRITY, DEST).then(() => {
    return fs.readFileAsync(DEST)
  }).then(data => {
    t.deepEqual(data, CONTENT, 'file successfully copied')
  })
})

test('copy.sync: copies content to a destination path synchronously', {
  skip: !fs.copyFile && 'Not supported on node versions without fs.copyFile'
}, t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const DEST = path.join(CACHE, 'foobar-file')
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  fixture.create(CACHE)
  read.copy.sync(CACHE, INTEGRITY, DEST)
  t.deepEqual(
    fs.readFileSync(DEST),
    CONTENT,
    'file successfully copied'
  )
  t.done()
})
