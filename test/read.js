var crypto = require('crypto')
var path = require('path')
var Tacks = require('tacks')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')
var Dir = Tacks.Dir
var File = Tacks.File
var read = require('../lib/content/read')

test('readStream: returns a stream with cache content data', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha256').update(CONTENT).digest('hex')
  var dir = {}
  dir[DIGEST] = File(CONTENT)
  var fixture = new Tacks(Dir({
    'content': Dir(dir)
  }))
  fixture.create(CACHE)
  var stream = read.readStream(CACHE, DIGEST)
  stream.on('error', function (e) { throw e })
  var buf = ''
  stream.on('data', function (data) { buf += data })
  stream.on('end', function () {
    t.ok(true, 'stream completed successfully')
    t.equal(CONTENT, buf, 'cache contents read correctly')
    t.end()
  })
})

test('readStream: allows hashAlgorithm configuration', function (t) {
  var CONTENT = 'foobarbaz'
  var HASH = 'sha1'
  var DIGEST = crypto.createHash(HASH).update(CONTENT).digest('hex')
  var dir = {}
  dir[DIGEST] = File(CONTENT)
  var fixture = new Tacks(Dir({
    'content': Dir(dir)
  }))
  fixture.create(CACHE)
  var stream = read.readStream(CACHE, DIGEST, { hashAlgorithm: HASH })
  stream.on('error', function (e) { throw e })
  var buf = ''
  stream.on('data', function (data) { buf += data })
  stream.on('end', function () {
    t.ok(true, 'stream completed successfully, off a sha1')
    t.equal(CONTENT, buf, 'cache contents read correctly')
    t.end()
  })
})

test('readStream: errors if content missing', function (t) {
  var stream = read.readStream(CACHE, 'whatnot')
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

test('readStream: errors if content fails checksum', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha256').update(CONTENT).digest('hex')
  var dir = {}
  dir[DIGEST] = File(CONTENT.slice(3)) // invalid contents!
  var fixture = new Tacks(Dir({
    'content': Dir(dir)
  }))
  fixture.create(CACHE)
  var stream = read.readStream(CACHE, DIGEST)
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
  var fixture = new Tacks(Dir({
    'content': Dir({
      'deadbeef': File('')
    })
  }))
  fixture.create(CACHE)
  t.plan(2)
  read.hasContent(CACHE, 'deadbeef', function (err, bool) {
    if (err) { throw err }
    t.ok(bool, 'returned true for existing content')
  })
  read.hasContent(CACHE, 'not-there', function (err, bool) {
    if (err) { throw err }
    t.notOk(bool, 'returned false for missing content')
  })
})
