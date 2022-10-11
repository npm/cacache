'use strict'

const os = require('os')

const t = require('tap')
const uniqueFilename = require('unique-filename')

// defines reusable errors
const genericError = new Error('ERR')
genericError.code = 'ERR'
const missingFileError = new Error('ENOENT')
missingFileError.code = 'ENOENT'
const pathExistsError = new Error('EEXIST')
pathExistsError.code = 'EEXIST'

// helpers
const CACHE = t.testdir()
const filename = uniqueFilename(os.tmpdir())
const getuid = process.getuid
const patchesGetuid = (t) => {
  process.getuid = () => 0
  t.teardown(() => {
    process.getuid = getuid
  })
}
const getFixOwner = (t, opts) => t.mock('../../lib/util/fix-owner', opts)

// chownr error handling tests

t.test('attempt to chownr existing path', async t => {
  patchesGetuid(t)
  const fixOwner = getFixOwner(t, {
    chownr: function chownr (path, uid, gid, cb) {
      cb(missingFileError)
    },
    'infer-owner': () => Promise.resolve({}),
  })

  await t.resolves(fixOwner.chownr(CACHE, filename), 'should not throw if path exists')
})

t.test('attempt to chownr unknown error', (t) => {
  patchesGetuid(t)
  const fixOwner = getFixOwner(t, {
    chownr: function chownr (path, uid, gid, cb) {
      cb(genericError)
    },
    'infer-owner': () => Promise.resolve({}),
  })

  t.plan(1)
  t.rejects(() => fixOwner.chownr(CACHE, filename), 'should throw unknown errors')
})

t.test('attempt to chownr using same user', async t => {
  patchesGetuid(t)
  const fixOwner = getFixOwner(t, {
    'infer-owner': () => Promise.resolve({
      uid: process.getuid(),
      gid: process.getgid(),
    }),
  })

  await t.resolves(fixOwner.chownr(CACHE, filename), 'should not throw')
})

t.test('calls setuid setgid to replace user', async t => {
  const setuid = process.setuid
  const setgid = process.setgid
  process.getuid = () => 0
  process.setuid = () => undefined
  process.setgid = () => undefined
  t.teardown(() => {
    process.getuid = getuid
    process.stuid = setuid
    process.stgid = setgid
  })
  const fixOwner = getFixOwner(t, {
    'infer-owner': () => {
      process.setuid(process.getuid())
      process.setgid(process.getgid())
      return Promise.resolve({
        uid: process.getuid(),
        gid: process.getgid(),
      })
    },
  })

  await t.resolves(fixOwner.chownr(CACHE, filename), 'should not throw')
})

t.test('attempt to chownr on platforms that do not need ownership fix', async t => {
  process.getuid = undefined
  t.teardown(() => {
    process.getuid = getuid
  })
  const fixOwner = require('../../lib/util/fix-owner')

  await t.resolves(fixOwner.chownr(CACHE, filename), 'should not throw')
})

t.test('uses infer-owner ids instead of process-retrieved if valid', async (t) => {
  const getgid = process.getgid
  process.getuid = () => 0
  process.getgid = () => 1
  t.teardown(() => {
    process.getuid = getuid
    process.getgid = getgid
  })
  const fixOwner = getFixOwner(t, {
    chownr: (path, uid, gid, cb) => {
      t.equal(path, filename, 'should match filename')
      t.equal(uid, 501, 'should match uid')
      t.equal(gid, 20, 'should match gid')
      return cb()
    },
    'infer-owner': () => {
      return Promise.resolve({
        uid: 501,
        gid: 20,
      })
    },
  })

  await fixOwner.chownr(CACHE, filename)
})

// mkdirfix error handling tests

t.test('attempt to mkdirfix existing path', async t => {
  const fixOwner = getFixOwner(t, {
    mkdirp: () => Promise.reject(pathExistsError),
  })

  const res = await fixOwner.mkdirfix(CACHE, filename)
  t.notOk(res, 'should not throw if path exists')
})

t.test('attempt to mkdirfix unknown error', (t) => {
  const fixOwner = getFixOwner(t, {
    mkdirp: () => Promise.reject(genericError),
  })

  t.plan(1)
  t.rejects(() => fixOwner.mkdirfix(CACHE, filename), 'should throw unknown errors')
})
