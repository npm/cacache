'use strict'

const contentPath = require('../lib/content/path')
const fs = require('fs')
const path = require('path')
const util = require('util')
const Tacks = require('tacks')
const { test } = require('tap')
const testDir = require('./util/test-dir')(__filename)

const stat = util.promisify(fs.stat)

const CACHE = path.join(testDir, 'cache')
const CacheContent = require('./util/cache-content')
const rm = require('../lib/content/rm')

test('removes a content entry', function (t) {
  const fixture = new Tacks(
    CacheContent({
      'sha1-deadbeef': ''
    })
  )
  fixture.create(CACHE)
  return rm(CACHE, 'sha1-deadbeef')
    .then(() => stat(contentPath(CACHE, 'sha1-deadbeef')))
    .then(() => {
      throw new Error('expected an error')
    })
    .catch((err) => {
      t.ok(err, 'fs.stat failed on rmed content')
      t.equal('ENOENT', err.code, 'file does not exist anymore')
    })
})

test('works fine if entry missing', function (t) {
  const fixture = new Tacks(CacheContent({}))
  fixture.create(CACHE)
  return rm(CACHE, 'sha1-deadbeef')
    .then(() => stat(contentPath(CACHE, 'sha1-deadbeef')))
    .then(() => {
      throw new Error('expected an error')
    })
    .catch((err) => {
      t.ok(err, 'fs.stat failed on rmed content')
      t.equal('ENOENT', err.code, 'file does not exist anymore')
    })
})
