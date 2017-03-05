'use strict'

var crypto = require('crypto')
var fromString = require('./util/from-string')
var path = require('path')
var pipe = require('mississippi').pipe
var requireInject = require('require-inject')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')

var contentPath = require('../lib/content/path')

test('allows setting a custom uid for cache contents on write', {
  skip: !process.getuid // On a platform that doesn't support uid/gid
}, function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha1').update(CONTENT).digest('hex')
  var NEWUID = process.getuid() + 1
  var NEWGID = process.getgid() + 1
  var updatedPaths = []
  var write = requireInject('../lib/content/write', {
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
  pipe(fromString(CONTENT), write.stream(CACHE, {
    uid: NEWUID,
    gid: NEWGID,
    hashAlgorithm: 'sha1'
  }), function (err) {
    if (err) { throw err }
    const cpath = contentPath(CACHE, DIGEST, 'sha1')
    var expectedPaths = [
      CACHE,
      path.join(CACHE, path.relative(CACHE, cpath).split(path.sep)[0]),
      cpath
    ]
    t.deepEqual(
      updatedPaths.sort(),
      expectedPaths,
      'all paths that needed user stuff set got set')
  })
})
