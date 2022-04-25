'use strict'

const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')
const ssri = require('ssri')
const t = require('tap')

const CacheContent = require('./util/cache-content')
const contentPath = require('../lib/content/path')

const write = require('../lib/content/write')

t.test('basic put', (t) => {
  const CACHE = t.testdir()
  const CONTENT = 'foobarbaz'
  // Default is sha512
  const INTEGRITY = ssri.fromData(CONTENT)
  let integrity
  return write.stream(CACHE)
    .on('integrity', (i) => {
      integrity = i
    })
    .end(CONTENT)
    .promise()
    .then(() => {
      const cpath = contentPath(CACHE, integrity)
      t.same(integrity, INTEGRITY, 'calculated integrity value matches')
      t.ok(fs.lstatSync(cpath).isFile(), 'content inserted as a single file')
      t.equal(fs.readFileSync(cpath, 'utf8'), CONTENT,
        'contents are identical to inserted content')
    })
})

t.test("checks input digest doesn't match data", (t) => {
  const CONTENT = 'foobarbaz'
  const integrity = ssri.fromData(CONTENT)
  let int1 = null
  let int2 = null
  const CACHE = t.testdir()

  return t.rejects(
    write.stream(CACHE, { integrity })
      .on('integrity', (int) => {
        int1 = int
      })
      .end('bazbarfoo')
      .promise(),
    { code: 'EINTEGRITY' },
    'returns integrity error'
  )
    .then(() => t.equal(int1, null, 'no digest emitted'))
    .then(() => write.stream(CACHE, { integrity })
      .on('integrity', int => {
        int2 = int
      })
      .end(CONTENT)
      .promise())
    .then(() => t.same(int2, integrity, 'returns a matching digest'))
})

t.test('errors if stream ends with no data', (t) => {
  const CACHE = t.testdir()
  let integrity = null
  return t.rejects(
    write.stream(CACHE).end('')
      .on('integrity', int => {
        integrity = int
      })
      .promise(),
    { code: 'ENODATA' },
    'get an error with a useful code'
  ).then(() => t.equal(integrity, null, 'no digest returned'))
})

t.test('errors if input size does not match expected', (t) => {
  let int1 = null
  let int2 = null

  const CACHE = t.testdir()
  return t.rejects(
    write.stream(CACHE, { size: 5 })
      .on('integrity', int => {
        int1 = int
      })
      .end('abc')
      .promise(),
    { code: 'EBADSIZE', expected: 5, found: 3 },
    'get an error when data smaller than expected'
  )
    .then(() => t.equal(int1, null, 'no digest returned'))
    .then(() => t.rejects(
      write.stream(CACHE, { size: 5 })
        .on('integrity', int => {
          int2 = int
        })
        .end('abcdefghi')
        .promise(),
      { code: 'EBADSIZE', expected: 5, found: 9 },
      'get an error when data bigger than expected'
    ))
    .then(() => t.equal(int2, null, 'no digest returned'))
})

t.test('does not overwrite content if already on disk', (t) => {
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: 'nope',
    })
  )

  let int1
  let int2
  // With a digest -- early short-circuiting
  return write.stream(CACHE, { integrity: INTEGRITY })
    .on('integrity', int => {
      int1 = int
    })
    .end(CONTENT)
    .promise()
    .then(() => {
      t.same(int1, INTEGRITY, 'short-circuit returns a matching digest')
      const d = fs.readFileSync(contentPath(CACHE, INTEGRITY), 'utf8')
      t.equal(d, 'nope', 'process short-circuited. Data not written.')
    })
    .then(() => write.stream(CACHE)
      .on('integrity', int => {
        int2 = int
      })
      .end(CONTENT)
      .promise()
    )
    .then(() => {
      t.same(int2, INTEGRITY, 'full write returns a matching digest')
      const d = fs.readFileSync(contentPath(CACHE, INTEGRITY), 'utf8')
      t.equal(d, 'nope', 'previously-written data intact - no dupe write')
    })
})

t.test('errors if input stream errors', (t) => {
  let integrity = null
  const CACHE = t.testdir()
  const putter = write.stream(CACHE)
    .on('integrity', (int) => {
      integrity = int
    })
  setTimeout(() => putter.inputStream.emit('error', new Error('bleh')))
  return t.rejects(putter.promise(), { message: 'bleh' })
    .then(() => {
      t.equal(integrity, null, 'no digest returned')
      t.throws(() => {
        fs.statSync(contentPath(CACHE, ssri.fromData('foobarbaz')))
      }, {
        code: 'ENOENT',
      }, 'target file missing. No files created')
    })
})

t.test('exits normally if file already open', (t) => {
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)
  const CACHE = t.testdir(
    CacheContent({
      [INTEGRITY]: CONTENT,
    })
  )
  let integrity
  // This case would only fail on Windows, when an entry is being read.
  // Generally, you'd get an EBUSY back.
  fs.open(contentPath(CACHE, INTEGRITY), 'r+', function (err, fd) {
    if (err) {
      throw err
    }

    write.stream(CACHE)
      .on('integrity', int => {
        integrity = int
      })
      .end(CONTENT)
      .promise()
      .then(() => {
        t.same(integrity, INTEGRITY, 'returns a matching digest')
        fs.closeSync(fd)
        rimraf.sync(contentPath(CACHE, INTEGRITY))
        t.end()
      })
  })
})

t.test('cleans up tmp on successful completion', (t) => {
  const CONTENT = 'foobarbaz'
  const CACHE = t.testdir()
  return write.stream(CACHE)
    .end(CONTENT)
    .promise()
    .then(() => new Promise((resolve, reject) => {
      const tmp = path.join(CACHE, 'tmp')
      fs.readdir(tmp, function (err, files) {
        if (!err || (err && err.code === 'ENOENT')) {
          files = files || []
          t.same(files, [], 'nothing in the tmp dir!')
          resolve()
        } else {
          reject(err)
        }
      })
    }))
})

t.test('cleans up tmp on error', (t) => {
  const CONTENT = 'foobarbaz'
  const CACHE = t.testdir()
  return t.rejects(
    write.stream(CACHE, { size: 1 })
      .end(CONTENT)
      .promise(),
    { code: 'EBADSIZE' },
    'got expected code'
  )
    .then(() => new Promise((resolve, reject) => {
      const tmp = path.join(CACHE, 'tmp')
      fs.readdir(tmp, function (err, files) {
        if (!err || (err && err.code === 'ENOENT')) {
          files = files || []
          t.same(files, [], 'nothing in the tmp dir!')
          resolve()
        } else {
          reject(err)
        }
      })
    }))
})

t.test('checks the size of stream data if opts.size provided', (t) => {
  const CONTENT = 'foobarbaz'
  let int1 = null
  const int2 = null
  let int3 = null

  const CACHE = t.testdir()
  t.test('chair too small', t => {
    const w = write.stream(CACHE, { size: CONTENT.length })
    w.write(CONTENT.slice(3))
    w.on('integrity', int => {
      int1 = int
    })
    setTimeout(() => w.end())
    return t.rejects(w.promise(), { code: 'EBADSIZE' }, 'bad size error code')
      .then(() => t.equal(int1, null, 'no digest returned by first stream'))
  })

  t.test('chair is too big', t => {
    const w = write.stream(CACHE, { size: CONTENT.length })
    w.write(CONTENT)
    setTimeout(() => w.end('quux'))
    return t.rejects(w.promise(), { code: 'EBADSIZE' }, 'bad size error code')
      .then(() => t.equal(int2, null, 'no digest returned by second stream'))
  })

  return t.test('chair is juuuuust right', t => {
    const w = write.stream(CACHE, { size: CONTENT.length })
    w.write(CONTENT)
    w.on('integrity', int => {
      int3 = int
    })
    setTimeout(() => w.end())
    return w.promise().then(() => t.ok(int3, 'got a digest'))
  })
})

t.test('only one algorithm for now', t => {
  const CACHE = t.testdir()
  t.throws(() => write(CACHE, 'foo', { algorithms: [1, 2] }), {
    message: 'opts.algorithms only supports a single algorithm for now',
  })
  t.end()
})

t.test('writes to cache with default options', t => {
  const CACHE = t.testdir()
  return t.resolveMatch(write(CACHE, 'foo'), {
    size: 3,
    integrity: {
      sha512: [
        {
          /* eslint-disable-next-line max-len */
          source: 'sha512-9/u6bgY2+JDlb7vzKD5STG+jIErimDgtYkdB0NxmODJuKCxBvl5CVNiCB3LFUYosWowMf37aGVlKfrU5RT4e1w==',
          /* eslint-disable-next-line max-len */
          digest: '9/u6bgY2+JDlb7vzKD5STG+jIErimDgtYkdB0NxmODJuKCxBvl5CVNiCB3LFUYosWowMf37aGVlKfrU5RT4e1w==',
          algorithm: 'sha512',
          options: [],
        },
      ],
    },
  })
})
