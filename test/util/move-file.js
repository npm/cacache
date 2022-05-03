'use strict'

const fs = require('@npmcli/fs')
const path = require('path')
const t = require('tap')

const moveFile = require('../../lib/util/move-file')

t.test('move a file', function (t) {
  const testDir = t.testdir({
    src: 'foo',
  })
  return moveFile(testDir + '/src', testDir + '/dest')
    .then(() => {
      return fs.readFile(testDir + '/dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'foo', 'file data correct')
      return fs.stat(testDir + '/src').catch((err) => {
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
      return fs.readFile(testDir + '/dest', 'utf8')
    })
    .then((data) => {
      t.equal(data, 'bar', 'conflicting file left intact')
      return fs.stat(testDir + '/src').catch((err) => {
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
      return fs.readdir(testDir + '/dest')
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

  return fs.open(testDir + '/dest', 'r+').then((fd) => {
    return moveFile(testDir + '/src', testDir + '/dest')
      .then(() => {
        return fs.close(fd)
      })
      .then(() => {
        return fs.readFile(testDir + '/dest', 'utf8')
      })
      .then((data) => {
        t.equal(data, 'bar', 'destination left intact')
        return fs.stat(testDir + '/src').catch((err) => {
          t.ok(err, 'src read error')
          t.equal(err.code, 'ENOENT', 'src does not exist')
        })
      })
  })
})

t.test('fallback to renaming on missing files post-move', async function (t) {
  const testDir = t.testdir({
    src: 'foo',
  })

  const missingFileError = new Error('ENOENT')
  missingFileError.code = 'ENOENT'
  const mockFS = {
    ...fs,
    async unlink (path) {
      throw missingFileError
    },
    async stat (path) {
      throw missingFileError
    },
  }
  const mockedMoveFile = t.mock('../../lib/util/move-file', {
    '@npmcli/fs': mockFS,
  })

  await mockedMoveFile(testDir + '/src', testDir + '/dest')
  const data = await fs.readFile(testDir + '/dest', 'utf8')
  t.equal(data, 'foo', 'file data correct')
  await t.rejects(
    fs.stat(testDir + '/src'),
    { code: 'ENOENT' },
    './src does not exist'
  )
})

t.test('non ENOENT error on move fallback', async function (t) {
  const testDir = t.testdir({
    src: 'foo',
  })

  const missingFileError = new Error('ENOENT')
  missingFileError.code = 'ENOENT'
  const otherError = new Error('UNKNOWN')
  otherError.code = 'OTHER'
  const mockFS = {
    ...fs,
    async unlink (path) {
      throw missingFileError
    },
    async stat (path) {
      throw otherError
    },

  }
  const mockedMoveFile = t.mock('../../lib/util/move-file', {
    '@npmcli/fs': mockFS,
  })

  await t.rejects(
    mockedMoveFile(testDir + '/src', testDir + '/dest'),
    { code: 'OTHER' },
    'throws other error'
  )
})

t.test('verify weird EPERM on Windows behavior', t => {
  const processPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'win32' })
  t.teardown(() => {
    Object.defineProperty(process, 'platform', { value: processPlatform })
  })
  const gfsLink = fs.link
  const gfs = require('@npmcli/fs')
  let calledMonkeypatch = false
  gfs.link = async (src, dest) => {
    calledMonkeypatch = true
    gfs.link = gfsLink
    throw Object.assign(new Error('yolo'), {
      code: 'EPERM',
    })
  }
  const testDir = t.testdir({
    eperm: {
      src: 'epermmy',
    },
  })

  return moveFile(testDir + '/eperm/src', testDir + '/eperm/dest')
    .then(() => t.ok(calledMonkeypatch, 'called the patched fs.link fn'))
    .then(() => t.rejects(fs.readFile('eperm/dest'), {
      code: 'ENOENT',
    }, 'destination file did not get written'))
    .then(() => t.rejects(fs.readFile('eperm/src'), {
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

    return fs.chmod(testDir + '/dest', parseInt('400', 8))
      .then(() => {
        return moveFile(testDir + '/src', path.join(testDir + '/dest', 'file'))
          .then(() => {
            throw new Error('move succeeded and should not have')
          })
          .catch((err) => {
            t.ok(err, 'error was returned')
            t.equal(err.code, 'EACCES', 'error is about permissions')
            return fs.readFile(testDir + '/src', 'utf8')
          })
      })
      .then((data) => {
        t.equal(data, 'foo', 'src contents left intact')
      })
  }
)
