var crypto = require('crypto')
var fromString = require('./util/from-string')
var path = require('path')
var pipe = require('mississippi').pipe
var requireInject = require('require-inject')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')

test('allows setting a custom uid for cache contents on write', {
  skip: !process.getuid // On a platform that doesn't support uid/gid
}, function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha1').update(CONTENT).digest('hex')
  var NEWUID = process.getuid() + 1
  var NEWGID = process.getgid() + 1
  var updatedPaths = []
  var putStream = requireInject('../lib/content/put-stream', {
    chownr: function (p, uid, gid, cb) {
      process.nextTick(function () {
        t.equal(uid, NEWUID, 'new uid set')
        t.equal(gid, NEWGID, 'new gid set')
        updatedPaths.push(p)
        cb(null)
      })
    }
  })
  t.plan(7)
  pipe(fromString(CONTENT), putStream(CACHE, {
    uid: NEWUID,
    gid: NEWGID
  }), function (err) {
    if (err) { throw err }
    var expectedPaths = [
      CACHE, // this includes cache/tmp
      path.join(CACHE, 'content'),
      path.join(CACHE, 'content', DIGEST)
    ]
    t.deepEqual(
      updatedPaths.sort(),
      expectedPaths,
      'all paths that needed user stuff set got set')
  })
})
