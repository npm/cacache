'use strict'

const fs = require('fs')
const path = require('path')
const ssri = require('ssri')
const t = require('tap')

const CacheContent = require('../fixtures/cache-content')

const read = require('../../lib/content/read')

// defines reusable errors
const genericError = new Error('ERR')
genericError.code = 'ERR'
const permissionError = new Error('EPERM')
permissionError.code = 'EPERM'

// helpers
const getRead = (t, opts) => t.mock('../../lib/content/read', opts)
const getReadStatFailure = (t, err) => getRead(t, {
  fs: {
    ...fs,
    statSync: () => {
      throw err
    },
  },
  'fs-extra': {
    ...fs.promises,
    stat: async () => {
      throw err
    },
  },
})

t.test('read: returns a Promise with cache content data', async t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  const data = await read(CACHE, INTEGRITY)
  t.same(data, CONTENT, 'cache contents read correctly')
})

t.test('read.stream: returns a stream with cache content data', async t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  const stream = read.stream(CACHE, INTEGRITY)
  const [fromStream, fromBulk] = await Promise.all([
    stream.concat(),
    read(CACHE, INTEGRITY, { size: CONTENT.length }),
  ])
  t.same(fromStream, CONTENT, 'stream data checks out')
  t.same(fromBulk, CONTENT, 'promise data checks out')
})

t.test('read: allows hashAlgorithm configuration', async t => {
  const CONTENT = Buffer.from('foobarbaz')
  const HASH = 'sha384'
  const INTEGRITY = ssri.fromData(CONTENT, { algorithms: [HASH] })
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  const stream = read.stream(CACHE, INTEGRITY)
  const [fromStream, fromBulk] = await Promise.all([
    stream.concat(),
    read(CACHE, INTEGRITY),
  ])
  t.same(fromStream, CONTENT, 'stream used algorithm')
  t.same(fromBulk, CONTENT, 'promise used algorithm')
})

t.test('read: errors if content missing', async t => {
  const CACHE = t.testdir({})
  const stream = read.stream(CACHE, 'sha512-whatnot')
  stream.on('data', function (data) {
    throw new Error('unexpected data: ' + JSON.stringify(data))
  })
  stream.on('end', function () {
    throw new Error('end was emitted even though stream errored')
  })
  await t.rejects(
    stream.promise(),
    { code: 'ENOENT' },
    'stream got the right error'
  )
  await t.rejects(
    read(CACHE, 'sha512-whatnot'),
    { code: 'ENOENT' },
    'bulk got the right error'
  )
})

t.test('read: errors if content fails checksum', async t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT.slice(3), // invalid contents!
    })
  )
  const stream = read.readStream(CACHE, INTEGRITY)
  stream.on('end', function () {
    throw new Error('end was emitted even though stream errored')
  })
  await t.rejects(
    stream.promise(),
    { code: 'EINTEGRITY' },
    'stream got the right error'
  )
  await t.rejects(
    read(CACHE, INTEGRITY),
    { code: 'EINTEGRITY' },
    'bulk got the right error'
  )
})

t.test('read: errors if content size does not match size option', async t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT.slice(3), // invalid contents!
    })
  )
  const stream = read.readStream(CACHE, INTEGRITY, { size: CONTENT.length })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  await t.rejects(
    stream.promise(),
    { code: 'EBADSIZE' },
    'stream got the right error'
  )
  await t.rejects(
    read(CACHE, INTEGRITY, { size: CONTENT.length }),
    { code: 'EBADSIZE' },
    'bulk got the right error'
  )
})

t.test('read: error while parsing provided integrity data', function (t) {
  const CACHE = t.testdir()
  const INTEGRITY = 'sha1-deadbeef'
  const mockedRead = getRead(t, {
    ssri: {
      parse () {
        throw genericError
      },
    },
  })

  t.plan(1)
  return t.rejects(
    mockedRead(CACHE, INTEGRITY),
    genericError,
    'should reject promise upon catching internal errors'
  )
})

t.test('read: unknown error parsing nested integrity data', function (t) {
  const CACHE = t.testdir()
  const INTEGRITY = 'sha1-deadbeef sha1-13371337'

  // patches method in order to force a last error scenario
  const mockedRead = getRead(t, {
    ssri: {
      parse (sri) {
        if (sri !== INTEGRITY) {
          throw genericError
        }

        return ssri.parse(sri)
      },
    },
  })

  t.plan(1)
  return t.rejects(
    mockedRead(CACHE, INTEGRITY),
    genericError,
    'should throw unknown errors'
  )
})

t.test('read: returns only first result if other hashes fails', function (t) {
  // sets up a cache that has multiple entries under the
  // same algorithm but then only one has real contents in the fs
  const CONTENT = {
    foo: Buffer.from('foo'),
    bar: Buffer.from('bar'),
  }
  const INTEGRITY = ssri.fromData(CONTENT.foo).concat(
    ssri.fromData(CONTENT.bar)
  )
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY.sha512[1]]: CONTENT.bar,
    })
  )

  t.plan(1)
  return t.resolveMatch(
    read(CACHE, INTEGRITY),
    CONTENT.bar,
    'should return only the first valid result'
  )
})

t.test('read: opening large files', function (t) {
  const CACHE = t.testdir()
  const mockedRead = getRead(t, {
    'fs-extra': {
      ...fs.promises,
      stat: async () => {
        return { size: Number.MAX_SAFE_INTEGER }
      },
    },
    'fs-minipass': {
      ReadStream: class {
        constructor (path, opts) {
          t.match(
            opts,
            {
              readSize: 64 * 1024 * 1024,
              size: Number.MAX_SAFE_INTEGER,
            },
            'should use fs-minipass interface'
          )
        }
      },
    },
    'minipass-pipeline': Array,
  })

  t.plan(1)
  mockedRead(CACHE, 'sha1-deadbeef')
})

t.test('hasContent: tests content existence', async t => {
  const CACHE = t.testdir(
    CacheContent({
      'sha1-deadbeef': '',
    })
  )
  const content = await read.hasContent(CACHE, 'sha1-deadbeef')
  t.ok(content.sri, 'returned sri for this content')
  t.equal(content.size, 0, 'returned the right size for this content')
  t.ok(content.stat.isFile(), 'returned actual stat object')
  await t.resolveMatch(
    read.hasContent(CACHE, 'sha1-not-there'),
    false,
    'returned false for missing content'
  )
  await t.resolveMatch(
    read.hasContent(CACHE, 'sha1-not-here sha1-also-not-here'),
    false,
    'multi-content hash failures work ok'
  )
})

t.test('hasContent: permission error', (t) => {
  const CACHE = t.testdir()
  // setup a syntetic permission error
  const mockedRead = getReadStatFailure(t, permissionError)

  t.plan(1)
  t.rejects(
    mockedRead.hasContent(CACHE, 'sha1-deadbeef sha1-13371337'),
    permissionError,
    'should reject on permission errors'
  )
})

t.test('hasContent: generic error', (t) => {
  const CACHE = t.testdir()
  const mockedRead = getReadStatFailure(t, genericError)

  t.plan(1)
  t.resolves(
    mockedRead.hasContent(CACHE, 'sha1-deadbeef sha1-13371337'),
    'should not reject on generic errors'
  )
})

t.test('hasContent: no integrity provided', (t) => {
  const CACHE = t.testdir()
  t.resolveMatch(
    read.hasContent(CACHE, ''),
    false,
    'should resolve with a value of false'
  )
  t.end()
})

t.test('copy: copies content to a destination path', async t => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  const DEST = path.join(CACHE, 'foobar-file')
  await read.copy(CACHE, INTEGRITY, DEST)
  const data = await fs.promises.readFile(DEST)
  t.same(data, CONTENT, 'file successfully copied')
})
