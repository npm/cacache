'use strict'

const contentPath = require('../lib/content/path')
const fs = require('graceful-fs')
const path = require('path')
const BB = require('bluebird')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

BB.promisifyAll(fs)

const CACHE = path.join(testDir, 'cache')
const CacheContent = require('./util/cache-content')
const rm = require('../lib/content/rm')

test('removes a content entry', function (t) {
  const fixture = new Tacks(CacheContent({
    'sha1-deadbeef': ''
  }))
  fixture.create(CACHE)
  return rm(CACHE, 'sha1-deadbeef').then(() => (
    fs.statAsync(contentPath(CACHE, 'sha1-deadbeef'))
  )).then(() => {
    throw new Error('expected an error')
  }).catch((err) => {
    t.ok(err, 'fs.stat failed on rmed content')
    t.equal('ENOENT', err.code, 'file does not exist anymore')
  })
})

test('works fine if entry missing', function (t) {
  const fixture = new Tacks(CacheContent({}))
  fixture.create(CACHE)
  return rm(CACHE, 'sha1-deadbeef').then(() => (
    fs.statAsync(contentPath(CACHE, 'sha1-deadbeef'))
  )).then(() => {
    throw new Error('expected an error')
  }).catch((err) => {
    t.ok(err, 'fs.stat failed on rmed content')
    t.equal('ENOENT', err.code, 'file does not exist anymore')
  })
})
