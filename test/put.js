var crypto = require('crypto')
var fs = require('fs')
var mkdirp = require('mkdirp')
var path = require('path')
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
test('basic file put', function (t) {
  fs.writeFile('index.js', CONTENT, function (err) {
    if (err) { throw err }
    var key = 'whatever'
    var hash = crypto.createHash('sha256')
    var stream = fs.createReadStream(
      'index.js'
    ).pipe(through(function (chunk, enc, next) {
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
          stat.isFile(),
          'content inserted as a single file'
        )
      })
      fs.readFile(content, 'utf8', function (err, data) {
        if (err) { throw err }
        t.equal(
          data,
          CONTENT,
          'file contents are identical to inserted content'
        )
      })
    })
  })
})
