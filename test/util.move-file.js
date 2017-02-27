'use strict'

const Promise = require('bluebird')

const fs = require('fs')
const path = require('path')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const Dir = Tacks.Dir
const File = Tacks.File
const moveFile = require('../lib/util/move-file')

Promise.promisifyAll(fs)

test('move a file', function (t) {
  const fixture = new Tacks(Dir({
    src: File('foo')
  }))
  fixture.create(testDir)
  return moveFile('src', 'dest').then(() => {
    return fs.readFileAsync('dest', 'utf8')
  }).then(data => {
    t.equal(data, 'foo', 'file data correct')
    return fs.statAsync('src').catch(err => {
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
    return fs.readFileAsync('dest', 'utf8')
  }).then(data => {
    t.equal(data, 'bar', 'conflicting file left intact')
    return fs.statAsync('src').catch(err => {
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
    return fs.readdirAsync('dest')
  }).then(files => {
    t.equal(files.length, 0, 'directory remains empty')
  })
})

test('does not error if destination file is open', function (t) {
  const fixture = new Tacks(Dir({
    src: File('foo'),
    dest: File('bar')
  }))
  fixture.create(testDir)

  return fs.openAsync('dest', 'r+').then(fd => {
    return moveFile('src', 'dest').then(() => {
      return fs.closeAsync(fd)
    }).then(() => {
      return fs.readFileAsync('dest', 'utf8')
    }).then(data => {
      t.equal(data, 'bar', 'destination left intact')
      return fs.statAsync('src').catch(err => {
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
  return fs.chmodAsync('dest', parseInt('400', 8)).then(() => {
    return moveFile('src', path.join('dest', 'file')).then(() => {
      throw new Error('move succeeded and should not have')
    }).catch(err => {
      t.ok(err, 'error was returned')
      t.equal(err.code, 'EACCES', 'error is about permissions')
      return fs.readFileAsync('src', 'utf8')
    })
  }).then(data => {
    t.equal(data, 'foo', 'src contents left intact')
  })
})
