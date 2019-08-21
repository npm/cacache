'use strict'

const BB = require('bluebird')

const fs = require('fs')
const path = require('path')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const Dir = Tacks.Dir
const File = Tacks.File
const moveFile = require('../lib/util/move-file')

const readFile = BB.promisify(fs.readFile)
const stat = BB.promisify(fs.stat)
const open = BB.promisify(fs.open)
const close = BB.promisify(fs.close)
const readdir = BB.promisify(fs.readdir)
const chmod = BB.promisify(fs.chmod)

test('move a file', function (t) {
  const fixture = new Tacks(Dir({
    src: File('foo')
  }))
  fixture.create(testDir)
  return moveFile('src', 'dest').then(() => {
    return readFile('dest', 'utf8')
  }).then((data) => {
    t.equal(data, 'foo', 'file data correct')
    return stat('src').catch((err) => {
      t.ok(err, 'src read error')
      t.equal(err.code, 'ENOENT', 'src does not exist')
    })
  })
})

test('does not clobber existing files', function (t) {
  const fixture = new Tacks(Dir({
    src: File('foo'),
    dest: File('bar')
  }))
  fixture.create(testDir)
  return moveFile('src', 'dest').then(() => {
    return readFile('dest', 'utf8')
  }).then((data) => {
    t.equal(data, 'bar', 'conflicting file left intact')
    return stat('src').catch((err) => {
      t.ok(err, 'src read error')
      t.equal(err.code, 'ENOENT', 'src file still deleted')
    })
  })
})

test('does not move a file into an existing directory', function (t) {
  const fixture = new Tacks(Dir({
    src: File('foo'),
    dest: Dir({})
  }))
  fixture.create(testDir)
  return moveFile('src', 'dest').then(() => {
    return readdir('dest')
  }).then((files) => {
    t.equal(files.length, 0, 'directory remains empty')
  })
})

test('does not error if destination file is open', function (t) {
  const fixture = new Tacks(Dir({
    src: File('foo'),
    dest: File('bar')
  }))
  fixture.create(testDir)

  return open('dest', 'r+').then((fd) => {
    return moveFile('src', 'dest').then(() => {
      return close(fd)
    }).then(() => {
      return readFile('dest', 'utf8')
    }).then((data) => {
      t.equal(data, 'bar', 'destination left intact')
      return stat('src').catch((err) => {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src does not exist')
      })
    })
  })
})

test('errors if dest is not writable', {
  skip: process.platform === 'win32'
}, function (t) {
  const fixture = new Tacks(Dir({
    src: File('foo'),
    dest: Dir({})
  }))
  fixture.create(testDir)
  return chmod('dest', parseInt('400', 8)).then(() => {
    return moveFile('src', path.join('dest', 'file')).then(() => {
      throw new Error('move succeeded and should not have')
    }).catch((err) => {
      t.ok(err, 'error was returned')
      t.equal(err.code, 'EACCES', 'error is about permissions')
      return readFile('src', 'utf8')
    })
  }).then((data) => {
    t.equal(data, 'foo', 'src contents left intact')
  })
})
