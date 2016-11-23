var crypto = require('crypto')
var fromString = require('./util/from-string')
var fs = require('fs')
var path = require('path')
var requireInject = require('require-inject')
var Tacks = require('tacks')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')
var contentPath = require('../lib/content/path')
var Dir = Tacks.Dir
var File = Tacks.File
var putStream = require('../lib/content/put-stream')

test('basic put', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha256').update(CONTENT).digest('hex')
  putStream(CACHE, fromString(CONTENT), function (err, foundDigest) {
    if (err) { throw err }
    var cpath = contentPath(CACHE, foundDigest)
    t.plan(3)
    t.equal(foundDigest, DIGEST, 'returned digest matches expected')
    fs.stat(cpath, function (err, stat) {
      if (err) { throw err }
      t.ok(stat.isFile(), 'content inserted as a single file')
    })
    fs.readFile(cpath, 'utf8', function (err, data) {
      if (err) { throw err }
      t.equal(data, CONTENT, 'contents are identical to inserted content')
    })
  })
})

test('checks input digest doesn\'t match data', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha256').update(CONTENT).digest('hex')
  t.plan(5)
  putStream(CACHE, fromString('bazbarfoo'), {
    digest: DIGEST
  }, function (err, foundDigest) {
    t.ok(!!err, 'got an error')
    t.ok(!foundDigest, 'no digest returned')
    t.equal(err.code, 'EBADCHECKSUM', 'returns a useful error code')
  })
  putStream(CACHE, fromString(CONTENT), {
    digest: DIGEST
  }, function (err, foundDigest) {
    t.ok(!err, 'completed without error')
    t.equal(foundDigest, DIGEST, 'returns a matching digest')
  })
})

test('errors if stream ends with no data', function (t) {
  putStream(CACHE, fromString(''), function (err, foundDigest) {
    t.ok(err, 'got an error')
    t.ok(!foundDigest, 'no digest returned')
    t.equal(err.code, 'ENODATA', 'returns useful error code')
    t.end()
  })
})

test('does not overwrite content if already on disk', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha256').update(CONTENT).digest('hex')
  var contentDir = {}
  contentDir[DIGEST] = File('nope')
  var fixture = new Tacks(Dir({
    'content': Dir(contentDir)
  }))
  fixture.create(CACHE)
  t.plan(6)
  // With a digest -- early short-circuiting
  putStream(CACHE, fromString('foobarbaz'), {
    digest: DIGEST
  }, function (err, foundDigest) {
    t.ok(!err, 'completed without error')
    t.equal(foundDigest, DIGEST, 'returns a matching digest')
    fs.readFile(path.join(CACHE, 'content', DIGEST), 'utf8', function (e, d) {
      if (e) { throw e }
      t.equal(d, 'nope', 'previously-written data intact - no dupe write')
    })
  })
  // Without a digest -- does not clobber
  putStream(CACHE, fromString('foobarbaz'), function (err, foundDigest) {
    t.ok(!err, 'completed without error')
    t.equal(foundDigest, DIGEST, 'returns a matching digest')
    fs.readFile(path.join(CACHE, 'content', DIGEST), 'utf8', function (e, d) {
      if (e) { throw e }
      t.equal(d, 'nope', 'previously-written data intact - no dupe write')
    })
  })
})

test('exits normally if file already open', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha256').update(CONTENT).digest('hex')
  var PATH = path.join(CACHE, 'content', DIGEST)
  var contentDir = {}
  contentDir[DIGEST] = File(CONTENT)
  var fixture = new Tacks(Dir({
    'content': Dir(contentDir)
  }))
  fixture.create(CACHE)
  // This case would only fail on Windows, when an entry is being read.
  // Generally, you'd get an EBUSY back.
  fs.open(PATH, 'r+', function (err, fd) {
    if (err) { throw err }
    putStream(CACHE, fromString(CONTENT), function (err, foundDigest) {
      t.ok(!err, 'completed without error')
      t.equal(foundDigest, DIGEST, 'returns a matching digest')
      fs.close(fd, function (err) {
        if (err) { throw err }
        t.end()
      })
    })
  })
})

test('allows setting a custom uid for cache contents on write', {
  skip: true // need to figure out how to mock this correctly?
  // skip: !process.getuid // On a platform that doesn't support uid/gid
}, function (t) {
  var NEWUID = process.getuid() + 1
  var NEWGID = process.getgid() + 1
  var ps = requireInject('../lib/content/put-stream', {
    chownr: function (path, uid, gid, cb) {
      process.nextTick(function () {
        t.equal(uid, NEWUID, 'new uid set')
        t.equal(gid, NEWGID, 'new gid set')
        cb(null)
      })
    }
  })
  ps(CACHE, fromString('foo'), {
    uid: NEWUID,
    gid: NEWGID
  }, function (err) {
    if (err) { throw err }
    t.end()
  })
})

test('cleans up tmp on successful completion')
test('cleans up tmp on error')
