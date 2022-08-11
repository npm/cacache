'use strict'

const fs = require('@npmcli/fs')
const path = require('path')
const t = require('tap')

const CACHE = t.testdir()

const mockedFixOwner = () => Promise.resolve(1)
// temporarily points to original mkdirfix implementation
mockedFixOwner.mkdirfix = require('../../lib/util/fix-owner').mkdirfix
const tmp = t.mock('../../lib/util/tmp', {
  '../../lib/util/fix-owner': mockedFixOwner,
})

t.test('creates a unique tmpdir inside the cache', async t => {
  const dir = await tmp.mkdir(CACHE)
  t.match(
    path.relative(CACHE, dir),
    /^tmp[\\/].*/,
    'returns a path inside tmp'
  )
  const s = await fs.stat(dir)
  t.ok(s.isDirectory(), 'path points to an existing directory')
})

t.test('provides a utility that does resource disposal on tmp', async t => {
  const dir = await tmp.withTmp(CACHE, async (dir) => {
    const s = await fs.stat(dir)
    t.ok(s.isDirectory(), 'path points to an existing directory')
    return dir
  })
  const [nope, yes] = await Promise.all([
    fs.stat(dir)
      .then(() => {
        throw new Error('expected fail')
      })
      .catch((err) => {
        if (err.code === 'ENOENT') {
          return undefined
        }

        throw err
      }),
    fs.stat(path.join(CACHE, 'tmp')),
  ])
  t.notOk(nope, 'tmp subdir removed')
  t.ok(yes.isDirectory(), 'tmp parent dir left intact')
})

t.test('withTmp should accept both opts and cb params', async t => {
  await tmp.withTmp(CACHE, { tmpPrefix: 'foo' }, dir => {
    t.ok(dir, 'dir should contain a valid response')
  })
})

t.test('provides a function for fixing ownership in the tmp dir', async t => {
  const res = await tmp.fix(CACHE)
  t.ok(res, 'fixOwner is successfully called')
})
