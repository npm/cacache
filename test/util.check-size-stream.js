'use strict'

var test = require('tap').test

var checkSizeStream = require('../lib/util/check-size-stream')

var CONTENT = 'foobarbazquux'
var SIZE = CONTENT.length

test('pipes data and succeeds if size is right', function (t) {
  var stream = checkSizeStream(SIZE)
  var buf = ''
  stream.on('data', function (d) { buf += d })
  stream.on('error', function (e) { throw e })
  stream.on('end', function () {
    t.equal(buf, CONTENT, 'content fully streamed by `end`.')
    t.end()
  })
  stream.write(CONTENT)
  stream.end()
})

test('errors if written size is bigger than expected', function (t) {
  var stream = checkSizeStream(SIZE)
  stream.on('data', function () {})
  stream.on('error', function (e) {
    t.ok(e, 'got an overflow error')
    t.equal(e.code, 'EBADSIZE', 'useful error code returned')
    t.equal(e.found, CONTENT.length + 9, 'found is full size of data')
    t.equal(e.expected, CONTENT.length, 'expected the length of CONTENTS')
    t.end()
  })
  stream.on('end', function () {
    throw new Error('end event should not be emitted on error')
  })
  stream.write(CONTENT + 'blablabla')
  stream.end()
})

test('errors if stream ends before reaching expected size', function (t) {
  var stream = checkSizeStream(SIZE)
  stream.on('data', function () {})
  stream.on('error', function (e) {
    t.ok(e, 'got a premature eof')
    t.equal(e.code, 'EBADSIZE', 'useful error code returned')
    t.equal(e.found, 3, 'found data of size 3')
    t.equal(e.expected, CONTENT.length, 'expected the length of CONTENTS')
    t.end()
  })
  stream.on('end', function () {
    throw new Error('end event should not be emitted on error')
  })
  stream.write(CONTENT.slice(0, 3))
  stream.end()
})

test('throws if a size isn\'t provided', function (t) {
  t.throws(function () {
    checkSizeStream()
  }, /size/i, 'errored on missing size arg')
  t.end()
})
