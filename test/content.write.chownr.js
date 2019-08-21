'use strict'

const NEWUID = process.getuid() + 1
const NEWGID = process.getgid() + 1

process.getuid = () => 0

const testDir = require('./util/test-dir')(__filename)
const path = require('path')
const CACHE = path.join(testDir, 'cache')
const fs = require('fs')
const stat = fs.lstat
fs.lstat = (path, cb) => {
  stat(path, (er, st) => {
    if (st && path === testDir) {
      st.uid = NEWUID
      st.gid = NEWGID
    }
    cb(er, st)
  })
}

const statSync = fs.lstatSync
fs.lstatSync = path => {
  const st = statSync(path)
  if (path === testDir) {
    st.uid = NEWUID
    st.gid = NEWGID
  }
  return st
}

const fromString = require('./util/from-string')
const { pipe } = require('mississippi')
const requireInject = require('require-inject')
const ssri = require('ssri')
const test = require('tap').test

const contentPath = require('../lib/content/path')

test('infers ownership from cache folder owner', {
  skip: process.getuid ? false : 'test only works on platforms that can set uid/gid'
}, t => {
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)
  const updatedPaths = []
  const write = requireInject('../lib/content/write', {
    chownr: function (p, uid, gid, cb) {
      process.nextTick(function () {
        const rel = path.relative(CACHE, p)
        t.equal(uid, NEWUID, 'new uid set for ' + rel)
        t.equal(gid, NEWGID, 'new gid set for ' + rel)
        updatedPaths.push(p)
        cb(null)
      })
    }
  })
  t.plan(7)
  pipe(fromString(CONTENT), write.stream(CACHE, {
    hashAlgorithm: 'sha1'
  }), function (err) {
    if (err) { throw err }
    const cpath = contentPath(CACHE, INTEGRITY)
    const expectedPaths = [
      CACHE,
      path.join(CACHE, path.relative(CACHE, cpath).split(path.sep)[0]),
      cpath
    ]
    t.deepEqual(
      updatedPaths.sort(),
      expectedPaths,
      'all paths that needed user stuff set got set')
  })
})
