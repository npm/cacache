'use strict'

const util = require('util')

const fs = require('fs')
const index = require('../lib/entry-index')
const path = require('path')
const t = require('tap')
const ssri = require('ssri')

const CacheContent = require('./util/cache-content')
const CONTENT = Buffer.from('foobarbaz')
const KEY = 'my-test-key'
const INTEGRITY = ssri.fromData(CONTENT)
const METADATA = { foo: 'bar' }
const contentPath = require('../lib/content/path')

const get = require('..').get

const rm = require('..').rm

const readFile = util.promisify(fs.readFile)
const mkdir = util.promisify(fs.mkdir)
const writeFile = util.promisify(fs.writeFile)
const readdir = util.promisify(fs.readdir)
const cacheContent = CacheContent({
  [INTEGRITY]: CONTENT,
})

t.test('rm.entry removes entries, not content', (t) => {
  const cache = t.testdir(cacheContent)
  return index
    .insert(cache, KEY, INTEGRITY, {
      metadata: METADATA,
    })
    .then(() => {
      t.equal(rm, rm.entry, 'rm is an alias for rm.entry')
      return rm.entry(cache, KEY)
    })
    .then(() => {
      return get(cache, KEY)
    })
    .then((res) => {
      throw new Error('unexpected success')
    })
    .catch((err) => {
      if (err.code === 'ENOENT') {
        t.match(err.message, KEY, 'entry no longer accessible')
        return
      }
      throw err
    })
    .then(() => {
      return readFile(contentPath(cache, INTEGRITY))
    })
    .then((data) => {
      t.same(data, CONTENT, 'content remains in cache')
    })
})

t.test('rm.content removes content, not entries', (t) => {
  const cache = t.testdir(cacheContent)
  return index
    .insert(cache, KEY, INTEGRITY, {
      metadata: METADATA,
    })
    .then(() => {
      return rm.content(cache, INTEGRITY)
    })
    .then(() => {
      return get(cache, KEY)
    })
    .then((res) => {
      throw new Error('unexpected success')
    })
    .catch((err) => {
      if (err.code === 'ENOENT') {
        t.match(err.message, /no such file/, 'entry no longer accessible')
        return
      }
      throw err
    })
    .then(() => {
      return readFile(contentPath(cache, INTEGRITY))
    })
    .then(() => {
      throw new Error('unexpected success')
    })
    .catch((err) => {
      if (err.code === 'ENOENT') {
        t.match(err.message, /no such file/, 'content gone')
        return
      }
      throw err
    })
})

t.test('rm.all deletes content and index dirs', (t) => {
  const cache = t.testdir(cacheContent)
  return index
    .insert(cache, KEY, INTEGRITY, {
      metadata: METADATA,
    })
    .then(() => {
      return mkdir(path.join(cache, 'tmp'))
    })
    .then(() => {
      return writeFile(path.join(cache, 'other.js'), 'hi')
    })
    .then(() => {
      return rm.all(cache)
    })
    .then(() => {
      return readdir(cache)
    })
    .then((files) => {
      t.same(
        files.sort(),
        ['other.js', 'tmp'],
        'removes content and index directories without touching other stuff'
      )
    })
})
