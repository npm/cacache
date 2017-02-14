'use strict'

var crypto = require('crypto')
var test = require('tap').test

var checksumStream = require('../lib/util/checksum-stream')

var CONTENT = 'foobarbazquux'
var DIGEST = crypto.createHash('sha1').update(CONTENT).digest('hex')

test('passes data through and emits a digest', function (t) {
  var stream = checksumStream()
  var buf = ''
  var digest
  stream.on('data', function (d) { buf += d })
  stream.on('error', function (e) { throw e })
  stream.on('digest', function (d) {
    digest = d
  })
  stream.on('end', function () {
    t.ok(true, 'stream finished successfully')
    t.equal(CONTENT, buf, 'data output correctly')
    t.equal(DIGEST, digest, 'digest emitted before end')
    t.end()
  })
  stream.write(CONTENT)
  stream.end()
})

test('succeeds if digest passed in matches data digest', function (t) {
  var stream = checksumStream(DIGEST)
  stream.on('error', function (e) { throw e })
  stream.on('data', function () {})
  stream.on('end', function () {
    t.ok(true, 'stream finished successfully')
    t.end()
  })
  stream.write(CONTENT)
  stream.end()
})

test('accepts a hashAlgorithm configuration', function (t) {
  var digest = crypto.createHash('sha1').update(CONTENT).digest('hex')
  var stream = checksumStream(digest, 'sha1')
  t.plan(2)
  stream.on('data', function (d) {})
  stream.on('error', function (e) { throw e })
  stream.on('digest', function (d) {
    t.equal(digest, d, 'emitted digest matches')
  })
  stream.on('end', function () {
    t.ok(true, 'stream finished successfully')
  })
  stream.write(CONTENT)
  stream.end()
})

test('errors if checksum fails', function (t) {
  var stream = checksumStream(DIGEST)
  stream.on('error', function (e) {
    t.ok(e, 'error emitted')
    t.equal(e.code, 'EBADCHECKSUM', 'has correct error code')
    t.done()
  })
  stream.on('digest', function (d) {
    throw new Error('digest emitted: ', d)
  })
  stream.on('end', function () {
    throw new Error('end event emitted')
  })
  stream.write(CONTENT.slice(3))
  stream.end()
})
