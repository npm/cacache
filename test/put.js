var crypto = require('crypto')
var fs = require('fs')
var mkdirp = require('mkdirp')
var path = require('path')
var tar = require('tar-fs')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)
var through = require('through2')
var zlib = require('zlib')

var CACHE = path.join(testDir, 'cache')
var contentPath = require('../lib/content/path')
// This test uses `put.stream` for most of its tests
// because it's the function the other writers call.
var put = require('../put')

var CONTENT = 'foobarbaz'
function basicPutTest (t, key, stream) {
  var hash = crypto.createHash('sha256')
  stream = stream.pipe(through(function (chunk, enc, next) {
    hash.update(chunk, enc)
    next(null, chunk)
  }))
  put.stream(CACHE, key, stream, function (err) {
    if (err) { throw err }
    var digest = hash.digest('hex')
    var content = contentPath(CACHE, digest)
    t.plan(2)
    fs.stat(content, function (err, stat) {
      if (err) { throw err }
      t.ok(
        stat.isDirectory(),
        'content inserted into a dir named by stream digest'
      )
    })
    var cachedFile = path.join(content, 'index.js')
    fs.readFile(cachedFile, 'utf8', function (err, data) {
      if (err) { throw err }
      t.equal(
        data,
        CONTENT,
        'file contents are identical to inserted content'
      )
    })
  })
}

test('basic file put', function (t) {
  fs.writeFile('index.js', CONTENT, function (err) {
    if (err) { throw err }
    basicPutTest(t, 'mydata', fs.createReadStream('index.js'))
  })
})

test('basic tarball put', function (t) {
  mkdirp('dir', function (err) {
    if (err) { throw err }
    fs.writeFile('dir/index.js', CONTENT, function (err) {
      if (err) { throw err }
      basicPutTest(t, 'mydata', tar.pack('dir'))
    })
  })
})

test('basic tgz put', function (t) {
  mkdirp('dir', function (err) {
    if (err) { throw err }
    fs.writeFile('dir/index.js', CONTENT, function (err) {
      if (err) { throw err }
      basicPutTest(
        t, 'mydata', tar.pack('dir').pipe(zlib.Gzip()))
    })
  })
})
