var fs = require('graceful-fs')
var path = require('path')
var Tacks = require('tacks')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')
var Dir = Tacks.Dir
var File = Tacks.File
var rm = require('../lib/content/rm')

test('removes a content entry', function (t) {
  var fixture = new Tacks(Dir({
    'content': Dir({
      'deadbeef': File('')
    })
  }))
  fixture.create(CACHE)
  rm(CACHE, 'deadbeef', function (err) {
    t.ifError(err, 'rm ran without error')
    fs.stat(path.join(CACHE, 'content', 'deadbeef'), function (err) {
      t.ok(err, 'fs.stat failed on rmed content')
      t.equal('ENOENT', err.code, 'file does not exist anymore')
      t.end()
    })
  })
})

test('works fine if entry missing', function (t) {
  var fixture = new Tacks(Dir({}))
  fixture.create(CACHE)
  rm(CACHE, 'deadbeef', function (err) {
    t.ifError(err, 'rm ran without error')
    fs.stat(path.join(CACHE, 'content', 'deadbeef'), function (err) {
      t.ok(err, 'fs.stat failed on rmed content')
      t.equal('ENOENT', err.code, 'file does not exist anymore')
      t.end()
    })
  })
})
