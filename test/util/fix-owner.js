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

// chownr and chownr.fix error handling tests

t.test('attempt to chownr existing path', (t) => {
  patchesGetuid(t)
  const fixOwner = getFixOwner(t, {
    chownr: function chownr (path, uid, gid, cb) {
      cb(missingFileError)
    },
    'infer-owner': () => Promise.resolve({}),
  })

  t.plan(1)
  return fixOwner.chownr(CACHE, filename)
    .then(res => {
      t.notOk(res, 'should not throw if path exists')
    })
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

t.test('attempt to chownr using same user', (t) => {
  patchesGetuid(t)
  const fixOwner = getFixOwner(t, {
    'infer-owner': () => Promise.resolve({
      uid: process.getuid(),
      gid: process.getgid(),
    }),
  })

  t.plan(1)
  return fixOwner.chownr(CACHE, filename)
    .then(res => {
      t.notOk(res, 'should not throw')
    })
})

t.test('calls setuid setgid to replace user', (t) => {
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

  t.plan(1)
  return fixOwner.chownr(CACHE, filename)
    .then(res => {
      t.notOk(res, 'should not throw')
    })
})

t.test('attempt to chownr.sync on platforms that do not need ownership fix', (t) => {
  process.getuid = undefined
  t.teardown(() => {
    process.getuid = getuid
  })
  const fixOwner = require('../../lib/util/fix-owner')

  t.plan(1)
  return fixOwner.chownr(CACHE, filename)
    .then(res => {
      t.notOk(res, 'should not throw')
    })
})

t.test('attempt to chownr.sync existing path', (t) => {
  patchesGetuid(t)
  function chownr () {}
  chownr.sync = () => {
    throw missingFileError
  }
  const fixOwner = getFixOwner(t, {
    chownr,
    'infer-owner': { sync: () => ({}) },
  })

  t.notOk(fixOwner.chownr.sync(CACHE, filename), 'should not throw if path exists')
  t.end()
})

t.test('attempt to chownr.sync unknown error', (t) => {
  patchesGetuid(t)
  function chownr () {}
  chownr.sync = () => {
    throw genericError
  }
  const fixOwner = getFixOwner(t, {
    chownr,
    'infer-owner': { sync: () => ({}) },
  })

  t.throws(() => fixOwner.chownr.sync(CACHE, filename), genericError, 'should throw unknown errors')
  t.end()
})

t.test('attempt to chownr.sync using same user', (t) => {
  patchesGetuid(t)
  const fixOwner = getFixOwner(t, {
    'infer-owner': {
      sync: () => ({
        uid: process.getuid(),
        gid: process.getgid(),
      }),
    },
  })

  t.notOk(fixOwner.chownr.sync(CACHE, filename), 'should not throw')
  t.end()
})

t.test('attempt to chownr.sync on platforms that do not need ownership fix', (t) => {
  process.getuid = undefined
  t.teardown(() => {
    process.getuid = getuid
  })
  const fixOwner = require('../../lib/util/fix-owner')

  t.notOk(fixOwner.chownr.sync(CACHE, filename), 'should not throw')
  t.end()
})

t.test('uses infer-owner ids instead of process-retrieved if valid', (t) => {
  const getgid = process.getgid
  process.getuid = () => 0
  process.getgid = () => 1
  t.teardown(() => {
    process.getuid = getuid
    process.getgid = getgid
  })
  t.plan(3)
  function chownr () {}
  chownr.sync = (path, uid, gid) => {
    t.equal(path, filename, 'should match filename')
    t.equal(uid, 501, 'should match uid')
    t.equal(gid, 20, 'should match gid')
  }
  const fixOwner = getFixOwner(t, {
    chownr,
    'infer-owner': {
      sync: () => ({
        uid: 501,
        gid: 20,
      }),
    },
  })

  fixOwner.chownr.sync(CACHE, filename)
})

// mkdirfix and mkdirfix.sync error handling tests

t.test('attempt to mkdirfix existing path', (t) => {
  const fixOwner = getFixOwner(t, {
    mkdirp: () => Promise.reject(pathExistsError),
  })

  t.plan(1)
  return fixOwner.mkdirfix(CACHE, filename)
    .then(res => {
      t.notOk(res, 'should not throw if path exists')
    })
})

t.test('attempt to mkdirfix unknown error', (t) => {
  const fixOwner = getFixOwner(t, {
    mkdirp: () => Promise.reject(genericError),
  })

  t.plan(1)
  t.rejects(() => fixOwner.mkdirfix(CACHE, filename), 'should throw unknown errors')
})

t.test('attempt to mkdirfix.sync existing path', (t) => {
  function mkdirp () {}
  mkdirp.sync = () => {
    throw pathExistsError
  }
  const fixOwner = getFixOwner(t, { mkdirp })

  t.notOk(fixOwner.mkdirfix.sync(CACHE, filename), 'should not throw if path exists')
  t.end()
})

t.test('attempt to mkdirfix.sync unknown error', (t) => {
  function mkdirp () {}
  mkdirp.sync = () => {
    throw genericError
  }
  const fixOwner = getFixOwner(t, { mkdirp })

  t.throws(
    () => fixOwner.mkdirfix.sync(CACHE, filename),
    genericError,
    'should throw unknown errors'
  )
  t.end()
})

t.test('attempt to mkdirfix.sync but no dir created', (t) => {
  function mkdirp () {}
  mkdirp.sync = () => {}
  const fixOwner = getFixOwner(t, { mkdirp })

  t.notOk(fixOwner.mkdirfix.sync(CACHE, filename), 'should not throw')
  t.end()
})
