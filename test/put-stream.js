var crypto = require('crypto')
var fs = require('fs')
var path = require('path')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')
var contentPath = require('../lib/content/path')
var putStream = require('../lib/content/put-stream')

test('basic put', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha256').update(CONTENT).digest('hex')
  fs.writeFile('foo.txt', CONTENT, function (err) {
    if (err) { throw err }
    var stream = fs.createReadStream('foo.txt')
    putStream(CACHE, stream, function (err, foundDigest) {
      if (err) { throw err }
      var cpath = contentPath(CACHE, foundDigest)
      t.plan(3)
      t.equal(foundDigest, DIGEST, 'returned digest matches expected')
      fs.stat(cpath, function (err, stat) {
        if (err) { throw err }
        t.ok(
          stat.isFile(),
          'content inserted as a single file'
        )
      })
      fs.readFile(cpath, 'utf8', function (err, data) {
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
