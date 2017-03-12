'use strict'

const fs = require('graceful-fs')
const path = require('path')
const BB = require('bluebird')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

BB.promisifyAll(fs)

const CACHE = path.join(testDir, 'cache')
const Dir = Tacks.Dir
const File = Tacks.File
const rm = require('../lib/content/rm')

test('removes a content entry', function (t) {
  const fixture = new Tacks(Dir({
    'content': Dir({
      'de': Dir({
        'deadbeef': File('')
      })
    })
  }))
  fixture.create(CACHE)
  return rm(CACHE, 'deadbeef').then(() => (
    fs.statAsync(path.join(CACHE, 'content', 'deadbeef'))
  )).then(() => {
    throw new Error('expected an error')
  }).catch(err => {
    t.ok(err, 'fs.stat failed on rmed content')
    t.equal('ENOENT', err.code, 'file does not exist anymore')
  })
})

test('works fine if entry missing', function (t) {
  const fixture = new Tacks(Dir({}))
  fixture.create(CACHE)
  return rm(CACHE, 'deadbeef').then(() => (
    fs.statAsync(path.join(CACHE, 'content', 'deadbeef'))
  )).then(() => {
    throw new Error('expected an error')
  }).catch(err => {
    t.ok(err, 'fs.stat failed on rmed content')
    t.equal('ENOENT', err.code, 'file does not exist anymore')
  })
})
