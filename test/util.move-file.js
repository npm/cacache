var fs = require('fs')
var path = require('path')
var Tacks = require('tacks')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var Dir = Tacks.Dir
var File = Tacks.File
var moveFile = require('../lib/util/move-file')

test('move a file', function (t) {
  var fixture = new Tacks(Dir({
    src: File('foo')
  }))
  fixture.create(testDir)
  moveFile('src', 'dest', function (err) {
    t.ifError(err, 'finished without error')
    fs.readFile('dest', 'utf8', function (err, data) {
      t.ifError(err, 'destination file created')
      t.equal(data, 'foo', 'file data correct')
      fs.stat('src', function (err) {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src does not exist')
        t.done()
      })
    })
  })
})

test('does not clobber existing files', function (t) {
  var fixture = new Tacks(Dir({
    src: File('foo'),
    dest: File('bar')
  }))
  fixture.create(testDir)
  moveFile('src', 'dest', function (err) {
    t.ifError(err, 'finished without error')
    fs.readFile('dest', 'utf8', function (err, data) {
      t.ifError(err, 'destination file exists')
      t.equal(data, 'bar', 'conflicting file left intact')
      fs.stat('src', function (err) {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src file still deleted')
        t.done()
      })
    })
  })
})

test('does not move a file into an existing directory', function (t) {
  var fixture = new Tacks(Dir({
    src: File('foo'),
    dest: Dir({})
  }))
  fixture.create(testDir)
  moveFile('src', 'dest', function (err) {
    t.ifError(err, 'finished without error')
    fs.readdir('dest', function (err, files) {
      t.ifError(err, 'dest should be a readable directory')
      t.equal(files.length, 0, 'directory remains empty')
      t.done()
    })
  })
})

test('does not error if destination file is open', function (t) {
  var fixture = new Tacks(Dir({
    src: File('foo'),
    dest: File('bar')
  }))
  fixture.create(testDir)
  fs.open('dest', 'r+', function (err, fd) {
    if (err) { throw err }
    moveFile('src', 'dest', function (err) {
      t.ifError(err, 'finished without error')
      fs.close(fd, function (err) {
        if (err) { throw err }
        fs.readFile('dest', 'utf8', function (err, data) {
          t.ifError(err, 'destination file created')
          t.equal(data, 'bar', 'destination left intact')
          fs.stat('src', function (err) {
            t.ok(err, 'src read error')
            t.equal(err.code, 'ENOENT', 'src does not exist')
            t.done()
          })
        })
      })
    })
  })
})

test('errors if dest is not writable', {
  skip: process.platform === 'win32'
}, function (t) {
  var fixture = new Tacks(Dir({
    src: File('foo'),
    dest: Dir({})
  }))
  fixture.create(testDir)
  fs.chmod('dest', parseInt('400', 8), function (err) {
    if (err) { throw err }
    moveFile('src', path.join('dest', 'file'), function (err) {
      t.ok(err, 'error was returned')
      t.equal(err.code, 'EACCES', 'error is about permissions')
      fs.readFile('src', 'utf8', function (err, data) {
        t.ifError(err, 'src file still exists')
        t.equal(data, 'foo', 'src contents left intact')
        t.done()
      })
    })
  })
})
