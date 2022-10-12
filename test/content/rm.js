'use strict'

const contentPath = require('../../lib/content/path')
const fs = require('fs/promises')
const t = require('tap')

const CacheContent = require('../fixtures/cache-content')
const rm = require('../../lib/content/rm')

t.test('removes a content entry', function (t) {
  const CACHE = t.testdir(
    CacheContent({
      'sha1-deadbeef': '',
    })
  )
  return rm(CACHE, 'sha1-deadbeef')
    .then(() => fs.stat(contentPath(CACHE, 'sha1-deadbeef')))
    .then(() => {
      throw new Error('expected an error')
    })
    .catch((err) => {
      t.ok(err, 'fs.stat failed on rmed content')
      t.equal('ENOENT', err.code, 'file does not exist anymore')
    })
})

t.test('works fine if entry missing', function (t) {
  const CACHE = t.testdir(CacheContent({}))
  return rm(CACHE, 'sha1-deadbeef')
    .then(() => fs.stat(contentPath(CACHE, 'sha1-deadbeef')))
    .then(() => {
      throw new Error('expected an error')
    })
    .catch((err) => {
      t.ok(err, 'fs.stat failed on rmed content')
      t.equal('ENOENT', err.code, 'file does not exist anymore')
    })
})
