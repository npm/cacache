'use strict'

const util = require('util')

const fs = require('fs')
const path = require('path')
const requireInject = require('require-inject')
const Tacks = require('tacks')
const { test } = require('tap')
const testDir = require('./util/test-dir')(__filename)

const Dir = Tacks.Dir
const File = Tacks.File
const moveFile = require('../lib/util/move-file')

const readFile = util.promisify(fs.readFile)
const stat = util.promisify(fs.stat)
const open = util.promisify(fs.open)
const close = util.promisify(fs.close)
const readdir = util.promisify(fs.readdir)
const chmod = util.promisify(fs.chmod)

test('move a file', function (t) {
  const fixture = new Tacks(
    Dir({
      src: File('foo')
    })
  )
  fixture.create(testDir)
  return moveFile('src', 'dest')
    .then(() => {
      return readFile('dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'foo', 'file data correct')
      return stat('src').catch((err) => {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src does not exist')
      })
    })
})

test('does not clobber existing files', function (t) {
  const fixture = new Tacks(
    Dir({
      src: File('foo'),
      dest: File('bar')
    })
  )
  fixture.create(testDir)
  return moveFile('src', 'dest')
    .then(() => {
      return readFile('dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'bar', 'conflicting file left intact')
      return stat('src').catch((err) => {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src file still deleted')
      })
    })
})

test('does not move a file into an existing directory', function (t) {
  const fixture = new Tacks(
    Dir({
      src: File('foo'),
      dest: Dir({})
    })
  )
  fixture.create(testDir)
  return moveFile('src', 'dest')
    .then(() => {
      return readdir('dest')
    })
    .then((files) => {
      t.equal(files.length, 0, 'directory remains empty')
    })
})

test('does not error if destination file is open', function (t) {
  const fixture = new Tacks(
    Dir({
      src: File('foo'),
      dest: File('bar')
    })
  )
  fixture.create(testDir)

  return open('dest', 'r+').then((fd) => {
    return moveFile('src', 'dest')
      .then(() => {
        return close(fd)
      })
      .then(() => {
        return readFile('dest', 'utf8')
      })
      .then((data) => {
        t.equal(data, 'bar', 'destination left intact')
        return stat('src').catch((err) => {
          t.ok(err, 'src read error')
          t.equal(err.code, 'ENOENT', 'src does not exist')
        })
      })
  })
})

test('fallback to renaming on missing files post-move', function (t) {
  const fixture = new Tacks(
    Dir({
      src: File('foo')
    })
  )
  fixture.create(testDir)

  // Sets up a fs mock that will fail at first unlink/stat call in order
  // to trigger the fallback scenario then restores the fs methods allowing
  // for the rename functionality to succeed
  let shouldMock = true
  const missingFileError = new Error('ENOENT')
  missingFileError.code = 'ENOENT'
  const mockedMoveFile = requireInject.withEmptyCache('../lib/util/move-file', {
    fs: Object.assign({}, fs, {
      unlink  (path, cb) {
        if (shouldMock) {
          cb(missingFileError)
        } else {
          fs.unlink(path, cb)
        }
      },
      stat (path, cb) {
        if (shouldMock && path === 'dest') {
          cb(missingFileError)
          shouldMock = false
        } else {
          fs.stat(path, cb)
        }
      }
    })
  })

  // actual tests are the same used in the simple "move a file" test
  // since the renaming fallback should accomplish the same results
  t.plan(3)
  return mockedMoveFile('src', 'dest')
    .then(() => {
      return readFile('dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'foo', 'file data correct')
      return stat('src').catch((err) => {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src does not exist')
      })
    })
})

test('verify weird EPERM on Windows behavior', t => {
  const gfsLink = fs.link
  global.__CACACHE_TEST_FAKE_WINDOWS__ = true
  const gfs = require('fs')
  let calledMonkeypatch = false
  gfs.link = (src, dest, cb) => {
    calledMonkeypatch = true
    setImmediate(() => cb(Object.assign(new Error('yolo'), {
      code: 'EPERM'
    })))
    gfs.link = gfsLink
    global.__CACACHE_TEST_FAKE_WINDOWS__ = false
  }
  const fixture = new Tacks(
    Dir({
      eperm: Dir({
        src: File('epermmy')
      })
    })
  )
  fixture.create(testDir)
  return moveFile('eperm/src', 'eperm/dest')
    .then(() => t.ok(calledMonkeypatch, 'called the patched fs.link fn'))
    .then(() => t.rejects(readFile('eperm/dest'), {
      code: 'ENOENT'
    }, 'destination file did not get written'))
    .then(() => t.rejects(readFile('eperm/src'), {
      code: 'ENOENT'
    }, 'src file did get deleted'))
})

test(
  'errors if dest is not writable',
  {
    skip: process.platform === 'win32'
  },
  function (t) {
    const fixture = new Tacks(
      Dir({
        src: File('foo'),
        dest: Dir({})
      })
    )
    fixture.create(testDir)
    return chmod('dest', parseInt('400', 8))
      .then(() => {
        return moveFile('src', path.join('dest', 'file'))
          .then(() => {
            throw new Error('move succeeded and should not have')
          })
          .catch((err) => {
            t.ok(err, 'error was returned')
            t.equal(err.code, 'EACCES', 'error is about permissions')
            return readFile('src', 'utf8')
          })
      })
      .then((data) => {
        t.equal(data, 'foo', 'src contents left intact')
      })
  }
)
