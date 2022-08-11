'use strict'

const NEWUID = process.getuid() + 1
const NEWGID = process.getgid() + 1

process.getuid = () => 0

const path = require('path')

const ssri = require('ssri')
const t = require('tap')

const contentPath = require('../../lib/content/path')

t.test('infers ownership from cache folder owner', async t => {
  const CACHE = t.testdir({ cache: {} })
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)
  const updatedPaths = []
  const write = t.mock('../../lib/content/write', {
    'infer-owner': async function (c) {
      return { uid: NEWUID, gid: NEWGID }
    },
    chownr: function (p, uid, gid, cb) {
      process.nextTick(function () {
        const rel = path.relative(CACHE, p)
        t.equal(uid, NEWUID, 'new uid set for ' + rel)
        t.equal(gid, NEWGID, 'new gid set for ' + rel)
        updatedPaths.push(p)
        cb(null)
      })
    },
  })
  t.plan(7)
  await write.stream(CACHE, { hashAlgorithm: 'sha1' }).end(CONTENT).promise()
  const cpath = contentPath(CACHE, INTEGRITY)
  const expectedPaths = [
    path.join(CACHE, path.relative(CACHE, cpath).split(path.sep)[0]),
    cpath,
    path.join(CACHE, 'tmp'),
  ]
  t.same(
    updatedPaths.sort(),
    expectedPaths,
    'all paths that needed user stuff set got set'
  )
})
