'use strict'

const util = require('util')

const fs = require('fs')
const path = require('path')
const requireInject = require('require-inject')
const ssri = require('ssri')
const Tacks = require('tacks')
const { test } = require('tap')
const testDir = require('./util/test-dir')(__filename)

const readFile = util.promisify(fs.readFile)

const CACHE = path.join(testDir, 'cache')
const CacheContent = require('./util/cache-content')

const read = require('../lib/content/read')

// defines reusable errors
const genericError = new Error('ERR')
genericError.code = 'ERR'
const permissionError = new Error('EPERM')
permissionError.code = 'EPERM'

// helpers
const getRead = (opts) => requireInject('../lib/content/read', opts)
const getReadLstatFailure = (err) => getRead({
  fs: Object.assign({}, require('fs'), {
    lstat (path, cb) {
      cb(err)
    },
    lstatSync () {
      throw err
    },
  }),
})

test('read: returns a Promise with cache content data', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  fixture.create(CACHE)
  return read(CACHE, INTEGRITY).then((data) => {
    t.same(data, CONTENT, 'cache contents read correctly')
  })
})

test('read.sync: reads synchronously', (t) => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  fixture.create(CACHE)
  const data = read.sync(CACHE, INTEGRITY)
  t.same(data, CONTENT, 'cache contents read correctly')
  t.end()
})

test('read.stream: returns a stream with cache content data', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  fixture.create(CACHE)
  const stream = read.stream(CACHE, INTEGRITY)
  return Promise.all([
    stream.concat(),
    read(CACHE, INTEGRITY, { size: CONTENT.length }),
  ]).then(([fromStream, fromBulk]) => {
    t.same(fromStream, CONTENT, 'stream data checks out')
    t.same(fromBulk, CONTENT, 'promise data checks out')
  })
})

test('read: allows hashAlgorithm configuration', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const HASH = 'whirlpool'
  const INTEGRITY = ssri.fromData(CONTENT, { algorithms: [HASH] })
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  fixture.create(CACHE)
  const stream = read.stream(CACHE, INTEGRITY)
  return Promise.all([
    stream.concat(),
    read(CACHE, INTEGRITY),
  ]).then(([fromStream, fromBulk]) => {
    t.same(fromStream, CONTENT, 'stream used algorithm')
    t.same(fromBulk, CONTENT, 'promise used algorithm')
  })
})

test('read: errors if content missing', function (t) {
  const stream = read.stream(CACHE, 'sha512-whatnot')
  stream.on('data', function (data) {
    throw new Error('unexpected data: ' + JSON.stringify(data))
  })
  stream.on('end', function () {
    throw new Error('end was emitted even though stream errored')
  })
  return Promise.all([
    stream.promise().catch((err) => {
      if (err.code === 'ENOENT') {
        return err
      }

      throw err
    }),
    read(CACHE, 'sha512-whatnot').catch((err) => {
      if (err.code === 'ENOENT') {
        return err
      }

      throw err
    }),
  ]).then(([streamErr, bulkErr]) => {
    t.match(streamErr, { code: 'ENOENT' }, 'stream got the right error')
    t.match(bulkErr, { code: 'ENOENT' }, 'bulk got the right error')
  })
})

test('read: errors if content fails checksum', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT.slice(3), // invalid contents!
    })
  )
  fixture.create(CACHE)
  const stream = read.readStream(CACHE, INTEGRITY)
  stream.on('end', function () {
    throw new Error('end was emitted even though stream errored')
  })
  return Promise.all([
    stream.promise().catch((err) => {
      if (err.code === 'EINTEGRITY') {
        return err
      }

      throw err
    }),
    read(CACHE, INTEGRITY).catch((err) => {
      if (err.code === 'EINTEGRITY') {
        return err
      }

      throw err
    }),
  ]).then(([streamErr, bulkErr]) => {
    t.match(streamErr, { code: 'EINTEGRITY' }, 'stream got the right error')
    t.match(bulkErr, { code: 'EINTEGRITY' }, 'bulk got the right error')
  })
})

test('read: errors if content size does not match size option', function (t) {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT.slice(3), // invalid contents!
    })
  )
  fixture.create(CACHE)
  const stream = read.readStream(CACHE, INTEGRITY, { size: CONTENT.length })
  stream.on('end', function () {
    throw new Error('end was called even though stream errored')
  })
  return Promise.all([
    stream.promise().catch((err) => {
      if (err.code === 'EBADSIZE') {
        return err
      }

      throw err
    }),
    read(CACHE, INTEGRITY, {
      size: CONTENT.length,
    }).catch((err) => {
      if (err.code === 'EBADSIZE') {
        return err
      }

      throw err
    }),
  ]).then(([streamErr, bulkErr]) => {
    t.match(streamErr, { code: 'EBADSIZE' }, 'stream got the right error')
    t.match(bulkErr, { code: 'EBADSIZE' }, 'bulk got the right error')
  })
})

test('read: error while parsing provided integrity data', function (t) {
  const INTEGRITY = 'sha1-deadbeef'
  const mockedRead = getRead({
    ssri: {
      parse (sri) {
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

test('read: unknown error parsing nested integrity data', function (t) {
  const INTEGRITY = 'sha1-deadbeef sha1-13371337'

  // patches method in order to force a last error scenario
  const mockedRead = getRead({
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

test('read: returns only first result if other hashes fails', function (t) {
  // sets up a cache that has multiple entries under the
  // same algorithm but then only one has real contents in the fs
  const CONTENT = {
    foo: Buffer.from('foo'),
    bar: Buffer.from('bar'),
  }
  const INTEGRITY = ssri.fromData(CONTENT.foo).concat(
    ssri.fromData(CONTENT.bar)
  )
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY.sha512[1]]: CONTENT.bar,
    })
  )
  fixture.create(CACHE)

  t.plan(1)
  return t.resolveMatch(
    read(CACHE, INTEGRITY),
    CONTENT.bar,
    'should return only the first valid result'
  )
})

test('read: opening large files', function (t) {
  const mockedRead = getRead({
    fs: Object.assign({}, require('fs'), {
      lstat (path, cb) {
        cb(null, { size: Number.MAX_SAFE_INTEGER })
      },
    }),
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

test('read.sync: unknown error parsing nested integrity data', (t) => {
  const INTEGRITY = 'sha1-deadbeef sha1-13371337'

  // patches method in order to force a last error scenario
  const mockedRead = getRead({
    ssri: {
      parse (sri) {
        if (sri !== INTEGRITY) {
          throw genericError
        }

        return ssri.parse(sri)
      },
    },
  })

  t.throws(
    () => mockedRead.sync(CACHE, INTEGRITY),
    genericError,
    'should throw last error found when parsing multiple hashes'
  )
  t.end()
})

test('read.sync: cache contains mismatching data', (t) => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT.slice(3),
    })
  )
  fixture.create(CACHE)

  t.throws(
    () => read.sync(CACHE, INTEGRITY),
    { code: 'EINTEGRITY' },
    'should throw integrity error'
  )
  t.end()
})

test('read.sync: content size value does not match option', (t) => {
  const CONTENT = Buffer.from('foobarbaz')
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT.slice(3),
    })
  )
  fixture.create(CACHE)

  t.throws(
    () => read.sync(CACHE, INTEGRITY, { size: CONTENT.length }),
    { code: 'EBADSIZE' },
    'should throw size error'
  )
  t.end()
})

test('hasContent: tests content existence', (t) => {
  const fixture = new Tacks(
    CacheContent({
      'sha1-deadbeef': '',
    })
  )
  fixture.create(CACHE)
  return Promise.all([
    read.hasContent(CACHE, 'sha1-deadbeef').then((content) => {
      t.ok(content.sri, 'returned sri for this content')
      t.equal(content.size, 0, 'returned the right size for this content')
      t.ok(content.stat.isFile(), 'returned actual stat object')
    }),
    read.hasContent(CACHE, 'sha1-not-there').then((content) => {
      t.equal(content, false, 'returned false for missing content')
    }),
    read
      .hasContent(CACHE, 'sha1-not-here sha1-also-not-here')
      .then((content) => {
        t.equal(content, false, 'multi-content hash failures work ok')
      }),
  ])
})

test('hasContent: permission error', (t) => {
  // setup a syntetic permission error
  const mockedRead = getReadLstatFailure(permissionError)

  t.plan(1)
  t.rejects(
    mockedRead.hasContent(CACHE, 'sha1-deadbeef sha1-13371337'),
    permissionError,
    'should reject on permission errors'
  )
})

test('hasContent: generic error', (t) => {
  const mockedRead = getReadLstatFailure(genericError)

  t.plan(1)
  t.resolves(
    mockedRead.hasContent(CACHE, 'sha1-deadbeef sha1-13371337'),
    'should not reject on generic errors'
  )
})

test('hasContent: no integrity provided', (t) => {
  t.resolveMatch(
    read.hasContent(CACHE, ''),
    false,
    'should resolve with a value of false'
  )
  t.end()
})

test('hasContent.sync: checks content existence synchronously', (t) => {
  const fixture = new Tacks(
    CacheContent({
      'sha1-deadbeef': '',
    })
  )
  fixture.create(CACHE)
  const content = read.hasContent.sync(CACHE, 'sha1-deadbeef')
  t.ok(content.sri, 'returned sri for this content')
  t.equal(content.size, 0, 'returned the right size for this content')
  t.ok(content.stat.isFile(), 'returned actual stat object')
  t.equal(
    read.hasContent.sync(CACHE, 'sha1-not-there'),
    false,
    'returned false for missing content'
  )
  t.equal(
    read.hasContent.sync(CACHE, 'sha1-not-here sha1-also-not-here'),
    false,
    'multi-content hash failures work ok'
  )
  t.end()
})

test('hasContent.sync: permission error', (t) => {
  const mockedRead = getReadLstatFailure(permissionError)

  t.throws(
    () => mockedRead.hasContent.sync(CACHE, 'sha1-deadbeef sha1-13371337'),
    permissionError,
    'should throw on permission errors'
  )
  t.end()
})

test('hasContent.sync: generic error', (t) => {
  const mockedRead = getReadLstatFailure(genericError)

  t.notOk(
    mockedRead.hasContent.sync(CACHE, 'sha1-deadbeef sha1-13371337'),
    'should not throw on generic errors'
  )
  t.end()
})

test('hasContent.sync: no integrity provided', (t) => {
  t.equal(
    read.hasContent.sync(CACHE, ''),
    false,
    'should returns false if no integrity provided'
  )
  t.end()
})

test(
  'copy: copies content to a destination path',
  {
    skip: !fs.copyFile && 'Not supported on node versions without fs.copyFile',
  },
  (t) => {
    const CONTENT = Buffer.from('foobarbaz')
    const INTEGRITY = ssri.fromData(CONTENT)
    const DEST = path.join(CACHE, 'foobar-file')
    const fixture = new Tacks(
      CacheContent({
        [INTEGRITY]: CONTENT,
      })
    )
    fixture.create(CACHE)
    return read
      .copy(CACHE, INTEGRITY, DEST)
      .then(() => {
        return readFile(DEST)
      })
      .then((data) => {
        t.same(data, CONTENT, 'file successfully copied')
      })
  }
)

test(
  'copy.sync: copies content to a destination path synchronously',
  {
    skip: !fs.copyFile && 'Not supported on node versions without fs.copyFile',
  },
  (t) => {
    const CONTENT = Buffer.from('foobarbaz')
    const INTEGRITY = ssri.fromData(CONTENT)
    const DEST = path.join(CACHE, 'foobar-file')
    const fixture = new Tacks(
      CacheContent({
        [INTEGRITY]: CONTENT,
      })
    )
    fixture.create(CACHE)
    read.copy.sync(CACHE, INTEGRITY, DEST)
    t.same(fs.readFileSync(DEST), CONTENT, 'file successfully copied')
    t.end()
  }
)

test('copyFile not supported by file system', (t) => {
  const mockedRead = getRead({
    fs: Object.assign({}, require('fs'), {
      copyFile: undefined,
    }),
  })

  t.notOk(mockedRead.copy, 'should not define copy')
  t.end()
})
