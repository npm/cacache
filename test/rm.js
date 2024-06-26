'use strict'

const fs = require('fs/promises')
const index = require('../lib/entry-index')
const path = require('path')
const t = require('tap')
const ssri = require('ssri')

const CacheContent = require('./fixtures/cache-content')
const CONTENT = Buffer.from('foobarbaz')
const KEY = 'my-test-key'
const INTEGRITY = ssri.fromData(CONTENT)
const METADATA = { foo: 'bar' }
const contentPath = require('../lib/content/path')

const get = require('..').get

const rm = require('..').rm

const cacheContent = CacheContent({
  [INTEGRITY]: CONTENT,
})

t.test('rm.entry removes entries, not content', async t => {
  const cache = t.testdir(cacheContent)
  await index.insert(cache, KEY, INTEGRITY, { metadata: METADATA })
  t.equal(rm, rm.entry, 'rm is an alias for rm.entry')
  await rm.entry(cache, KEY)
  await t.rejects(
    get(cache, KEY),
    {
      code: 'ENOENT',
      message: new RegExp(KEY),
    },
    'entry no longer accessible'
  )
  const data = await fs.readFile(contentPath(cache, INTEGRITY))
  t.same(data, CONTENT, 'content remains in cache')
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
    .then(() => {
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
      return fs.readFile(contentPath(cache, INTEGRITY))
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

t.test('rm.all deletes content and index dirs', async t => {
  const cache = t.testdir(cacheContent)
  await index.insert(cache, KEY, INTEGRITY, { metadata: METADATA })
  await fs.mkdir(path.join(cache, 'tmp'))
  await fs.writeFile(path.join(cache, 'other.js'), 'hi')
  await rm.all(cache)
  const files = await fs.readdir(cache)
  t.same(
    files.sort(),
    ['other.js', 'tmp'],
    'removes content and index directories without touching other stuff'
  )
})
