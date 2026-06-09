'use strict'

const fs = require('fs/promises')
const path = require('path')
const t = require('tap')

const cacheDir = require('../../lib/util/cache-dir')

t.test('mkdir creates the cache directory tag', async t => {
  const cache = t.testdir()
  await cacheDir.mkdir(cache)
  const tag = await fs.readFile(path.join(cache, 'CACHEDIR.TAG'), 'utf8')
  t.equal(tag, cacheDir.tagContent)
})

t.test('mkdir keeps an existing cache directory tag', async t => {
  const cache = t.testdir({
    'CACHEDIR.TAG': 'existing tag',
  })

  await cacheDir.mkdir(cache)
  const tag = await fs.readFile(path.join(cache, 'CACHEDIR.TAG'), 'utf8')
  t.equal(tag, 'existing tag')
})

t.test('mkdir rethrows unexpected tag write errors', async t => {
  const cacheDir = t.mock('../../lib/util/cache-dir', {
    'fs/promises': {
      mkdir: async () => {},
      writeFile: async () => {
        const err = new Error('permission denied')
        err.code = 'EACCES'
        throw err
      },
    },
  })

  await t.rejects(cacheDir.mkdir('/cache'), { code: 'EACCES' })
})
