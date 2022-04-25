'use strict'

const util = require('util')

const fs = require('fs')
const path = require('path')
const t = require('tap')

const moveFile = require('../lib/util/move-file')

const readFile = util.promisify(fs.readFile)
const stat = util.promisify(fs.stat)
const open = util.promisify(fs.open)
const close = util.promisify(fs.close)
const readdir = util.promisify(fs.readdir)
const chmod = util.promisify(fs.chmod)

t.test('move a file', function (t) {
  const testDir = t.testdir({
    src: 'foo',
  })
  return moveFile(testDir + '/src', testDir + '/dest')
    .then(() => {
      return readFile(testDir + '/dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'foo', 'file data correct')
      return stat(testDir + '/src').catch((err) => {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src does not exist')
      })
    })
})

t.test('does not clobber existing files', function (t) {
  const testDir = t.testdir({
    src: 'foo',
    dest: 'bar',
  })
  return moveFile(testDir + '/src', testDir + '/dest')
    .then(() => {
      return readFile(testDir + '/dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'bar', 'conflicting file left intact')
      return stat(testDir + '/src').catch((err) => {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src file still deleted')
      })
    })
})

t.test('does not move a file into an existing directory', function (t) {
  const testDir = t.testdir({
    src: 'foo',
    dest: {},
  })
  return moveFile(testDir + '/src', testDir + '/dest')
    .then(() => {
      return readdir(testDir + '/dest')
    })
    .then((files) => {
      t.equal(files.length, 0, 'directory remains empty')
    })
})

t.test('does not error if destination file is open', function (t) {
  const testDir = t.testdir({
    src: 'foo',
    dest: 'bar',
  })

  return open(testDir + '/dest', 'r+').then((fd) => {
    return moveFile(testDir + '/src', testDir + '/dest')
      .then(() => {
        return close(fd)
      })
      .then(() => {
        return readFile(testDir + '/dest', 'utf8')
      })
      .then((data) => {
        t.equal(data, 'bar', 'destination left intact')
        return stat(testDir + '/src').catch((err) => {
          t.ok(err, 'src read error')
          t.equal(err.code, 'ENOENT', 'src does not exist')
        })
      })
  })
})

t.test('fallback to renaming on missing files post-move', function (t) {
  const testDir = t.testdir({
    src: 'foo',
  })

  // Sets up a fs mock that will fail at first unlink/stat call in order
  // to trigger the fallback scenario then restores the fs methods allowing
  // for the rename functionality to succeed
  let shouldMock = true
  const missingFileError = new Error('ENOENT')
  missingFileError.code = 'ENOENT'
  const mockFS = {
    ...fs,
    promises: {
      ...fs.promises,
      rename: async (src, dest) => {
        throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' })
      },
      link: async (src, dest) => {
        throw new Error('nope')
      },
      unlink: async (path) => {
        if (shouldMock) {
          throw missingFileError
        } else {
          return fs.promises.unlink(path)
        }
      },
      lstat: async (path, cb) => {
        if (shouldMock) {
          shouldMock = false
          throw missingFileError
        } else {
          return fs.promises.lstat(path)
        }
      },
      stat: async (path, cb) => {
        if (shouldMock) {
          shouldMock = false
          throw missingFileError
        } else {
          return fs.promises.stat(path)
        }
      },
    },
    rename: (src, dest, cb) => {
      if (shouldMock) {
        cb(Object.assign(new Error('EXDEV'), { code: 'EXDEV' }))
      } else {
        fs.rename(src, dest, cb)
      }
    },
    link (src, dest, cb) {
      cb(new Error('nope'))
    },
    unlink (path, cb) {
      if (shouldMock) {
        cb(missingFileError)
      } else {
        fs.unlink(path, cb)
      }
    },
    lstat (path, cb) {
      if (shouldMock && path === testDir + '/dest') {
        cb(missingFileError)
        shouldMock = false
      } else {
        fs.lstat(path, cb)
      }
    },
    stat (path, cb) {
      if (shouldMock && path === testDir + '/dest') {
        cb(missingFileError)
        shouldMock = false
      } else {
        fs.stat(path, cb)
      }
    },
  }
  const mockedMoveFile = t.mock('../lib/util/move-file', {
    fs: mockFS,
    '@npmcli/move-file': t.mock('@npmcli/move-file', {
      fs: mockFS,
    }),
  })

  // actual tests are the same used in the simple "move a file" test
  // since the renaming fallback should accomplish the same results
  t.plan(3)
  return mockedMoveFile(testDir + '/src', testDir + '/dest')
    .then(() => {
      return readFile(testDir + '/dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'foo', 'file data correct')
      return stat(testDir + '/src').then(() => {
        t.fail('src file should not exist, but it does!')
      }).catch((err) => {
        t.ok(err, 'src read error')
        t.equal(err.code, 'ENOENT', 'src does not exist')
      })
    })
})

t.test('verify weird EPERM on Windows behavior', t => {
  const gfsLink = fs.link
  global.__CACACHE_TEST_FAKE_WINDOWS__ = true
  const gfs = require('fs')
  let calledMonkeypatch = false
  gfs.link = (src, dest, cb) => {
    calledMonkeypatch = true
    setImmediate(() => cb(Object.assign(new Error('yolo'), {
      code: 'EPERM',
    })))
    gfs.link = gfsLink
    global.__CACACHE_TEST_FAKE_WINDOWS__ = false
  }
  const testDir = t.testdir({
    eperm: {
      src: 'epermmy',
    },
  })

  return moveFile(testDir + '/eperm/src', testDir + '/eperm/dest')
    .then(() => t.ok(calledMonkeypatch, 'called the patched fs.link fn'))
    .then(() => t.rejects(readFile('eperm/dest'), {
      code: 'ENOENT',
    }, 'destination file did not get written'))
    .then(() => t.rejects(readFile('eperm/src'), {
      code: 'ENOENT',
    }, 'src file did get deleted'))
})

t.test(
  'errors if dest is not writable',
  {
    skip: process.platform === 'win32',
  },
  function (t) {
    const testDir = t.testdir({
      src: 'foo',
      dest: {},
    })

    return chmod(testDir + '/dest', parseInt('400', 8))
      .then(() => {
        return moveFile(testDir + '/src', path.join(testDir + '/dest', 'file'))
          .then(() => {
            throw new Error('move succeeded and should not have')
          })
          .catch((err) => {
            t.ok(err, 'error was returned')
            t.equal(err.code, 'EACCES', 'error is about permissions')
            return readFile(testDir + '/src', 'utf8')
          })
      })
      .then((data) => {
        t.equal(data, 'foo', 'src contents left intact')
      })
  }
)
