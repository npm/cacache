'use strict'

const {
  chmod,
  open,
  readFile,
  readdir,
  stat,
} = require('fs/promises')
const fs = require('fs')
const path = require('path')
const t = require('tap')

const moveFile = require('../../lib/util/move-file')

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

t.test('does not move a file into an existing directory', async t => {
  const testDir = t.testdir({
    src: 'foo',
    dest: {},
  })
  await moveFile(testDir + '/src', testDir + '/dest')
  const files = await readdir(testDir + '/dest')
  t.equal(files.length, 0, 'directory remains empty')
})

t.test('does not error if destination file is open', function (t) {
  const testDir = t.testdir({
    src: 'foo',
    dest: 'bar',
  })

  return open(testDir + '/dest', 'r+').then((fh) => {
    return moveFile(testDir + '/src', testDir + '/dest')
      .then(() => {
        return fh.close()
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

t.test('fallback to renaming on missing files post-move', async t => {
  const testDir = t.testdir({
    src: 'foo',
  })

  const missingFileError = new Error('ENOENT')
  missingFileError.code = 'ENOENT'
  const mockFS = {
    ...fs.promises,
    async unlink (path) {
      throw missingFileError
    },
    async stat (path) {
      throw missingFileError
    },
  }
  const mockedMoveFile = t.mock('../../lib/util/move-file', {
    'fs/promises': mockFS,
  })

  await mockedMoveFile(testDir + '/src', testDir + '/dest')
  const data = await readFile(testDir + '/dest', 'utf8')
  t.equal(data, 'foo', 'file data correct')
  await t.rejects(
    stat(testDir + '/src'),
    { code: 'ENOENT' },
    './src does not exist'
  )
})

t.test('non ENOENT error on move fallback', {
  skip: process.platform === 'android'
    ? 'The move fallback is unreachable on Android.'
    : false,
}, async function (t) {
  const testDir = t.testdir({
    src: 'foo',
  })

  const missingFileError = new Error('ENOENT')
  missingFileError.code = 'ENOENT'
  const otherError = new Error('UNKNOWN')
  otherError.code = 'OTHER'
  const mockFS = {
    ...fs.promises,
    async unlink (path) {
      throw missingFileError
    },
    async stat (path) {
      throw otherError
    },

  }
  const mockedMoveFile = t.mock('../../lib/util/move-file', {
    'fs/promises': mockFS,
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

  let calledMonkeyPatch = false
  const mockFS = {
    ...fs.promises,
    link: async (src, dest) => {
      calledMonkeyPatch = true
      throw Object.assign(new Error('yolo'), { code: 'EPERM' })
    },
  }

  const mockedMoveFile = t.mock('../../lib/util/move-file.js', {
    'fs/promises': mockFS,
  })

  const testDir = t.testdir({
    eperm: {
      src: 'epermmy',
    },
  })

  return mockedMoveFile(testDir + '/eperm/src', testDir + '/eperm/dest')
    .then(() => t.ok(calledMonkeyPatch, 'called the patched fs.link fn'))
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
  async t => {
    const testDir = t.testdir({
      src: 'foo',
      dest: {},
    })

    await chmod(testDir + '/dest', parseInt('400', 8))
    await t.rejects(
      moveFile(testDir + '/src', path.join(testDir + '/dest', 'file')),
      { code: 'EACCES' },
      'error is about permissions'
    )

    const data = await readFile(testDir + '/src', 'utf8')
    t.equal(data, 'foo', 'src contents left intact')
  }
)
