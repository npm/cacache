'use strict'

const util = require('util')

const fs = require('fs')
const index = require('../lib/entry-index')
const path = require('path')
const Tacks = require('tacks')
const { test } = require('tap')
const testDir = require('./util/test-dir')(__filename)
const ssri = require('ssri')

const CacheContent = require('./util/cache-content')
const CACHE = path.join(testDir, 'cache')
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

test('rm.entry removes entries, not content', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index
    .insert(CACHE, KEY, INTEGRITY, {
      metadata: METADATA
    })
    .then(() => {
      t.equal(rm, rm.entry, 'rm is an alias for rm.entry')
      return rm.entry(CACHE, KEY)
    })
    .then(() => {
      return get(CACHE, KEY)
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
      return readFile(contentPath(CACHE, INTEGRITY))
    })
    .then((data) => {
      t.deepEqual(data, CONTENT, 'content remains in cache')
    })
})

test('rm.content removes content, not entries', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index
    .insert(CACHE, KEY, INTEGRITY, {
      metadata: METADATA
    })
    .then(() => {
      return rm.content(CACHE, INTEGRITY)
    })
    .then(() => {
      return get(CACHE, KEY)
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
      return readFile(contentPath(CACHE, INTEGRITY))
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

test('rm.all deletes content and index dirs', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index
    .insert(CACHE, KEY, INTEGRITY, {
      metadata: METADATA
    })
    .then(() => {
      return mkdir(path.join(CACHE, 'tmp'))
    })
    .then(() => {
      return writeFile(path.join(CACHE, 'other.js'), 'hi')
    })
    .then(() => {
      return rm.all(CACHE)
    })
    .then(() => {
      return readdir(CACHE)
    })
    .then((files) => {
      t.deepEqual(
        files.sort(),
        ['other.js', 'tmp'],
        'removes content and index directories without touching other stuff'
      )
    })
})
