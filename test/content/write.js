'use strict'

const events = require('events')
const fs = require('fs')
const { Minipass } = require('minipass')
const path = require('path')
const ssri = require('ssri')
const t = require('tap')

const CacheContent = require('../fixtures/cache-content')
const contentPath = require('../../lib/content/path')

const write = require('../../lib/content/write')

t.test('basic put', async t => {
  const CACHE = t.testdir()
  const CONTENT = 'foobarbaz'
  // Default is sha512
  const INTEGRITY = ssri.fromData(CONTENT)
  let integrity
  await write.stream(CACHE).on('integrity', (i) => {
    integrity = i
  }).end(CONTENT).promise()
  const cpath = contentPath(CACHE, integrity)
  t.same(integrity, INTEGRITY, 'calculated integrity value matches')
  t.ok(fs.lstatSync(cpath).isFile(), 'content inserted as a single file')
  t.equal(fs.readFileSync(cpath, 'utf8'), CONTENT, 'contents are identical to inserted content')
})

t.test('basic put, providing external integrity emitter', async (t) => {
  const CACHE = t.testdir()
  const CONTENT = 'foobarbaz'
  const INTEGRITY = ssri.fromData(CONTENT)

  const write = t.mock('../../lib/content/write.js', {
    ssri: {
      ...ssri,
      integrityStream: () => {
        throw new Error('Should not be called')
      },
    },
  })

  const source = new Minipass().end(CONTENT)

  const tee = new Minipass()

  const integrityStream = ssri.integrityStream()
  // since the integrityStream is not going anywhere, we need to manually resume it
  // otherwise it'll get stuck in paused mode and will never process any data events
  integrityStream.resume()
  const integrityStreamP = Promise.all([
    events.once(integrityStream, 'integrity').then((res) => res[0]),
    events.once(integrityStream, 'size').then((res) => res[0]),
  ])

  const contentStream = write.stream(CACHE, { integrityEmitter: integrityStream })
  const contentStreamP = Promise.all([
    events.once(contentStream, 'integrity').then((res) => res[0]),
    events.once(contentStream, 'size').then((res) => res[0]),
    contentStream.promise(),
  ])

  tee.pipe(integrityStream)
  tee.pipe(contentStream)
  source.pipe(tee)

  const [
    [ssriIntegrity, ssriSize],
    [contentIntegrity, contentSize],
  ] = await Promise.all([
    integrityStreamP,
    contentStreamP,
  ])

  t.equal(ssriSize, CONTENT.length, 'ssri got the right size')
  t.equal(contentSize, CONTENT.length, 'content got the right size')
  t.same(ssriIntegrity, INTEGRITY, 'ssri got the right integrity')
  t.same(contentIntegrity, INTEGRITY, 'content got the right integrity')

  const cpath = contentPath(CACHE, ssriIntegrity)
  t.ok(fs.lstatSync(cpath).isFile(), 'content inserted as a single file')
  t.equal(fs.readFileSync(cpath, 'utf8'), CONTENT, 'contents are identical to inserted content')
})

t.test("checks input digest doesn't match data", async t => {
  const CONTENT = 'foobarbaz'
  const integrity = ssri.fromData(CONTENT)
  let int1 = null
  let int2 = null
  const CACHE = t.testdir()

  await t.rejects(
    write.stream(CACHE, { integrity }).on('integrity', (int) => {
      int1 = int
    })
      .end('bazbarfoo').promise(),
    { code: 'EINTEGRITY' },
    'returns integrity error'
  )
  t.equal(int1, null, 'no digest emitted')
  await write.stream(CACHE, { integrity }).on('integrity', int => {
    int2 = int
  })
    .end(CONTENT).promise()
  t.same(int2, integrity, 'returns a matching digest')
})

t.test('errors if stream ends with no data', async t => {
  const CACHE = t.testdir()
  let integrity = null
  await t.rejects(
    write.stream(CACHE).end('').on('integrity', int => {
      integrity = int
    }).promise(),
    { code: 'ENODATA' },
    'get an error with a useful code'
  )
  t.equal(integrity, null, 'no digest returned')
})

t.test('errors if input size does not match expected', async t => {
  let int1 = null
  let int2 = null

  const CACHE = t.testdir()
  await t.rejects(
    write.stream(CACHE, { size: 5 }).on('integrity', int => {
      int1 = int
    }).end('abc').promise(),
    { code: 'EBADSIZE', expected: 5, found: 3 },
    'get an error when data smaller than expected'
  )
  t.equal(int1, null, 'no digest returned')
  await t.rejects(
    write.stream(CACHE, { size: 5 }).on('integrity', int => {
      int2 = int
    }).end('abcdefghi').promise(),
    { code: 'EBADSIZE', expected: 5, found: 9 },
    'get an error when data bigger than expected'
  )
  t.equal(int2, null, 'no digest returned')
})

t.test('does not overwrite content if already on disk', async t => {
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
  await write.stream(CACHE, { integrity: INTEGRITY }).on('integrity', int => {
    int1 = int
  })
    .end(CONTENT).promise()
  t.same(int1, INTEGRITY, 'short-circuit returns a matching digest')
  const d1 = fs.readFileSync(contentPath(CACHE, INTEGRITY), 'utf8')
  t.equal(d1, 'nope', 'process short-circuited. Data not written.')
  await write.stream(CACHE).on('integrity', int => {
    int2 = int
  })
    .end(CONTENT).promise()
  t.same(int2, INTEGRITY, 'full write returns a matching digest')
  const d2 = fs.readFileSync(contentPath(CACHE, INTEGRITY), 'utf8')
  t.equal(d2, 'nope', 'previously-written data intact - no dupe write')
})

t.test('errors if input stream errors', async t => {
  let integrity = null
  const CACHE = t.testdir()
  const putter = write.stream(CACHE)
    .on('integrity', (int) => {
      integrity = int
    })
  setTimeout(() => putter.inputStream.emit('error', new Error('bleh')))
  await t.rejects(putter.promise(), { message: 'bleh' })
  t.equal(integrity, null, 'no digest returned')
  t.throws(() => {
    fs.statSync(contentPath(CACHE, ssri.fromData('foobarbaz')))
  }, {
    code: 'ENOENT',
  }, 'target file missing. No files created')
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
  fs.open(contentPath(CACHE, INTEGRITY), 'r+', async function (err, fd) {
    if (err) {
      throw err
    }

    await write.stream(CACHE).on('integrity', int => {
      integrity = int
    })
      .end(CONTENT)
      .promise()
    t.same(integrity, INTEGRITY, 'returns a matching digest')
    fs.closeSync(fd)
    fs.rmSync(contentPath(CACHE, INTEGRITY), { recursive: true, force: true })
    t.end()
  })
})

t.test('cleans up tmp on successful completion', async t => {
  const CONTENT = 'foobarbaz'
  const CACHE = t.testdir()
  await write.stream(CACHE).end(CONTENT).promise()
  await new Promise((resolve, reject) => {
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
  })
})

t.test('Handles moveFile error other than EEXIST', async t => {
  const write = t.mock('../../lib/content/write.js', {
    '@npmcli/fs': {
      moveFile: async () => {
        throw new Error('Unknown error')
      },
    },
  })
  const CONTENT = 'foobarbaz'
  const CACHE = t.testdir()
  await t.rejects(
    write.stream(CACHE).end(CONTENT).promise(),
    { message: 'Unknown error' }
  )
})

t.test('cleans up tmp on streaming error', (t) => {
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

t.test('cleans up tmp on non streaming error', (t) => {
  // mock writefile and make it reject
  const CONTENT = 'foobarbaz'
  const CACHE = t.testdir({ 'content-v2': 'oh no a file' })
  return t.rejects(write(CACHE, CONTENT))
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

t.test('accepts multiple algorithms', async t => {
  const CACHE = t.testdir()
  const CONTENT = 'multiple algorithms!'
  const { integrity } = await write(CACHE, CONTENT, { algorithms: ['sha512', 'sha1'] })
  const cpath512 = contentPath(CACHE, integrity.sha512.toString())
  t.ok(fs.lstatSync(cpath512).isFile(), 'sha512 content written')
  const cpath1 = contentPath(CACHE, integrity.sha1.toString())
  t.ok(fs.lstatSync(cpath1).isFile(), 'sha1 content written')
  t.equal(fs.readFileSync(cpath512, 'utf8'),
    CONTENT, 'sha512 contents are identical to inserted content')
  t.equal(fs.readFileSync(cpath1, 'utf8'),
    CONTENT, 'sha1 contents are identical to inserted content')
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
