'use strict'

const fromString = require('./util/from-string')
const fs = require('fs')
const path = require('path')
const pipe = require('mississippi').pipe
const rimraf = require('rimraf')
const ssri = require('ssri')
const Tacks = require('tacks')
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const CACHE = path.join(testDir, 'cache')
const CacheContent = require('./util/cache-content')
const contentPath = require('../lib/content/path')

const write = require('../lib/content/write')

test('basic put', t => {
  const CONTENT = 'foobarbaz'
  // Default is sha512
  const INTEGRITY = ssri.fromData(CONTENT)
  let integrity
  const src = fromString(CONTENT)
  const stream = write.stream(CACHE).on('integrity', i => {
    integrity = i
  })
  pipe(src, stream, err => {
    if (err) { throw err }
    const cpath = contentPath(CACHE, integrity)
    t.plan(3)
    t.deepEqual(integrity, INTEGRITY, 'calculated integrity value matches')
    fs.lstat(cpath, (err, stat) => {
      if (err) { throw err }
      t.ok(stat.isFile(), 'content inserted as a single file')
    })
    fs.readFile(cpath, 'utf8', (err, data) => {
      if (err) { throw err }
      t.equal(data, CONTENT, 'contents are identical to inserted content')
    })
  })
})

test('checks input digest doesn\'t match data', t => {
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)
  t.plan(5)
  let int1
  let int2
  pipe(fromString('bazbarfoo'), write.stream(CACHE, {
    integrity: INTEGRITY
  }).on('integrity', int => {
    int1 = int
  }), err => {
    t.ok(!int1, 'no digest emitted')
    t.ok(!!err, 'got an error')
    t.equal(err.code, 'EINTEGRITY', 'returns a useful error code')
  })
  pipe(fromString(CONTENT), write.stream(CACHE, {
    integrity: INTEGRITY
  }).on('integrity', int => {
    int2 = int
  }), err => {
    t.ok(!err, 'completed without error')
    t.deepEqual(int2, INTEGRITY, 'returns a matching digest')
  })
})

test('errors if stream ends with no data', t => {
  let integrity = null
  pipe(fromString(''), write.stream(CACHE).on('integrity', int => {
    integrity = int
  }), err => {
    t.ok(err, 'got an error')
    t.equal(integrity, null, 'no digest returned')
    t.equal(err.code, 'ENODATA', 'returns useful error code')
    t.end()
  })
})

test('errors if input size does not match expected', t => {
  t.plan(10)
  let int1 = null
  pipe(fromString('abc'), write.stream(CACHE, {
    size: 5
  }).on('integrity', int => {
    int1 = int
  }), err => {
    t.ok(err, 'got an error when data smaller than expected')
    t.equal(int1, null, 'no digest returned')
    t.equal(err.code, 'EBADSIZE', 'returns useful error code')
    t.equal(err.expected, 5, 'error includes expected size')
    t.equal(err.found, 3, 'error includes found size')
  })
  let int2 = null
  pipe(fromString('abcdefghi'), write.stream(CACHE, {
    size: 5
  }).on('integrity', int => {
    int2 = int
  }), err => {
    t.ok(err, 'got an error when data bigger than expected')
    t.equal(int2, null, 'no digest returned')
    t.equal(err.code, 'EBADSIZE', 'returns useful error code')
    t.equal(err.expected, 5, 'error includes expected size')
    t.equal(err.found, 9, 'error includes found size')
  })
})

test('does not overwrite content if already on disk', t => {
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: 'nope'
  }))
  fixture.create(CACHE)
  t.plan(4)
  let int1
  let int2
  // With a digest -- early short-circuiting
  pipe(fromString(CONTENT), write.stream(CACHE, {
    integrity: INTEGRITY
  }).on('integrity', int => {
    int1 = int
  }), err => {
    if (err) { throw err }
    t.deepEqual(int1, INTEGRITY, 'short-circuit returns a matching digest')
    fs.readFile(contentPath(CACHE, INTEGRITY), 'utf8', (e, d) => {
      if (e) { throw e }
      t.equal(d, 'nope', 'process short-circuited. Data not written.')
    })
  })
  pipe(fromString(CONTENT), write.stream(CACHE).on('integrity', int => {
    int2 = int
  }), err => {
    if (err) { throw err }
    t.deepEqual(int2, INTEGRITY, 'full write returns a matching digest')
    fs.readFile(contentPath(CACHE, INTEGRITY), 'utf8', function (e, d) {
      if (e) { throw e }
      t.equal(d, 'nope', 'previously-written data intact - no dupe write')
    })
  })
})

test('errors if input stream errors', t => {
  const stream = fromString('foobarbaz')
  .on('end', () => stream.emit('error', new Error('bleh')))
  let integrity
  const putter = write.stream(CACHE).on('integrity', int => {
    integrity = int
  })
  pipe(stream, putter, err => {
    t.ok(err, 'got an error')
    t.ok(!integrity, 'no digest returned')
    t.match(err && err.message, 'bleh', 'returns the error from input stream')
    fs.stat(contentPath(CACHE, ssri.fromData('foobarbaz')), (err, stat) => {
      t.ok(err, 'got an error')
      t.equal(err.code, 'ENOENT', 'target file missing. No files created.')
      t.end()
    })
  })
})

test('exits normally if file already open', t => {
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)
  const fixture = new Tacks(CacheContent({
    [INTEGRITY]: CONTENT
  }))
  let integrity
  fixture.create(CACHE)
  // This case would only fail on Windows, when an entry is being read.
  // Generally, you'd get an EBUSY back.
  fs.open(contentPath(CACHE, INTEGRITY), 'r+', function (err, fd) {
    if (err) { throw err }
    pipe(fromString(CONTENT), write.stream(CACHE).on('integrity', int => {
      integrity = int
    }), err => {
      if (err) { throw err }
      t.deepEqual(integrity, INTEGRITY, 'returns a matching digest')
      fs.close(fd, err => {
        if (err) { throw err }
        rimraf(contentPath(CACHE, INTEGRITY), err => {
          if (err) { throw err }
          t.end()
        })
      })
    })
  })
})

test('cleans up tmp on successful completion', t => {
  const CONTENT = 'foobarbaz'
  pipe(fromString(CONTENT), write.stream(CACHE), err => {
    if (err) { throw err }
    const tmp = path.join(CACHE, 'tmp')
    fs.readdir(tmp, function (err, files) {
      if (!err || (err && err.code === 'ENOENT')) {
        files = files || []
        t.deepEqual(files, [], 'nothing in the tmp dir!')
        t.end()
      } else {
        throw err
      }
    })
  })
})

test('cleans up tmp on error', t => {
  const CONTENT = 'foobarbaz'
  pipe(fromString(CONTENT), write.stream(CACHE, { size: 1 }), err => {
    t.ok(err, 'got an error')
    t.equal(err.code, 'EBADSIZE', 'got expected code')
    const tmp = path.join(CACHE, 'tmp')
    fs.readdir(tmp, function (err, files) {
      if (!err || (err && err.code === 'ENOENT')) {
        files = files || []
        t.deepEqual(files, [], 'nothing in the tmp dir!')
        t.end()
      } else {
        throw err
      }
    })
  })
})

test('checks the size of stream data if opts.size provided', t => {
  const CONTENT = 'foobarbaz'
  let int1, int2, int3
  t.plan(8)
  pipe(
    fromString(CONTENT.slice(3)),
    write.stream(CACHE, {
      size: CONTENT.length
    }).on('integrity', int => { int1 = int }),
    err => {
      t.ok(!!err, 'got an error')
      t.ok(!int1, 'no digest returned')
      t.equal(err.code, 'EBADSIZE', 'returns a useful error code')
    }
  )
  pipe(
    fromString(CONTENT + 'quux'),
    write.stream(CACHE, {
      size: CONTENT.length
    }).on('integrity', int => { int2 = int }),
    err => {
      t.ok(!!err, 'got an error')
      t.ok(!int2, 'no digest returned')
      t.equal(err.code, 'EBADSIZE', 'returns a useful error code')
    }
  )
  pipe(
    fromString(CONTENT),
    write.stream(CACHE, {
      size: CONTENT.length
    }).on('integrity', int => { int3 = int }),
    err => {
      t.ifError(err, 'completed without error')
      t.ok(int3, 'got a digest')
    }
  )
})
