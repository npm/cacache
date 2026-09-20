'use strict'

const fs = require('fs/promises')
const path = require('path')
const { Readable } = require('stream')
const index = require('../lib/entry-index')
const memo = require('../lib/memoization')
const t = require('tap')
const ssri = require('ssri')

const CONTENT = Buffer.from('foobarbaz', 'utf8')
const KEY = 'my-test-key'
const INTEGRITY = ssri.fromData(CONTENT).toString()
const METADATA = { foo: 'bar' }
const contentPath = require('../lib/content/path')

const put = require('..').put

t.test('basic bulk insertion', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, CONTENT)
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const dataPath = contentPath(CACHE, integrity)
  const data = await fs.readFile(dataPath)
  t.same(data, CONTENT, 'content was correctly inserted')
})

t.test('basic bulk insertion from a string', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, CONTENT.toString('utf8'))
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'string content was correctly inserted')
})

t.test('accepts a Uint8Array', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, new Uint8Array(CONTENT))
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'Uint8Array content was correctly inserted')
})

t.test('accepts an ArrayBuffer', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, Uint8Array.from(CONTENT).buffer)
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'ArrayBuffer content was correctly inserted')
})

t.test('accepts a fetch Response', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, new Response(CONTENT))
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'Response body was correctly inserted')
})

t.test('accepts a duck-typed fetch Response', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, {
    status: 200,
    ok: true,
    body: null,
    arrayBuffer: async () => Uint8Array.from(CONTENT).buffer,
  })
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'duck-typed Response body was correctly inserted')
})

t.test('accepts a duck-typed fetch Response identified by ok', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, {
    ok: true,
    body: null,
    arrayBuffer: async () => Uint8Array.from(CONTENT).buffer,
  })
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'ok-only duck-typed Response was correctly inserted')
})

t.test('accepts a Response.body web stream', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, new Response(CONTENT).body)
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'streamed Response body was correctly inserted')
})

t.test('accepts a fetch Response with a null body via arrayBuffer()', async t => {
  const CACHE = t.testdir()
  const empty = Buffer.alloc(0)
  const integrity = await put(CACHE, KEY, new Response(null))
  t.equal(integrity.toString(), ssri.fromData(empty).toString(), 'hashed empty body')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, empty, 'empty Response was correctly inserted')
})

t.test('accepts a Blob', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, new Blob([CONTENT]))
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'Blob content was correctly inserted')
})

t.test('accepts a duck-typed Blob', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, {
    size: CONTENT.length,
    type: 'application/octet-stream',
    slice () {},
    arrayBuffer: async () => Uint8Array.from(CONTENT).buffer,
  })
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'duck-typed Blob content was correctly inserted')
})

t.test('accepts a Node stream', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, Readable.from([CONTENT]))
  t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
  const data = await fs.readFile(contentPath(CACHE, integrity))
  t.same(data, CONTENT, 'Node stream content was correctly inserted')
})

t.test('rejects when a Node stream errors', async t => {
  const CACHE = t.testdir()
  const stream = new Readable({
    read () {
      this.destroy(new Error('boom'))
    },
  })
  await t.rejects(
    put(CACHE, KEY, stream),
    { message: /boom/ },
    'stream errors are forwarded from put()'
  )
})

t.test('optionally memoizes data from a fetch Response', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, new Response(CONTENT), {
    metadata: METADATA,
    memoize: true,
  })
  t.equal(integrity.toString(), INTEGRITY, 'integrity returned as usual')
  const entry = await index.find(CACHE, KEY)
  t.same(
    memo.get(CACHE, KEY),
    {
      data: CONTENT,
      entry: entry,
    },
    'Response body inserted into memoization cache by key'
  )
})

t.test('rejects unsupported data types with a clear error', async t => {
  const CACHE = t.testdir()
  await t.rejects(
    put(CACHE, KEY, { not: 'bytes' }),
    { code: 'EBADTYPE', message: /Response/ },
    'got a clear type error instead of ssri hashing failure'
  )
  await t.rejects(
    put(CACHE, KEY, null),
    { code: 'EBADTYPE', message: /Received null/ },
    'null is rejected with a clear type error'
  )
  await t.rejects(
    put(CACHE, KEY, 42),
    { code: 'EBADTYPE', message: /Received number/ },
    'numbers are rejected with a clear type error'
  )
  const nameless = Object.create(null)
  nameless.not = 'bytes'
  await t.rejects(
    put(CACHE, KEY, nameless),
    { code: 'EBADTYPE', message: /Received Object/ },
    'null-prototype objects are rejected with a clear type error'
  )
})

t.test('creates a CACHEDIR.TAG marker on bulk insertion', async t => {
  const CACHE = t.testdir()
  await put(CACHE, KEY, CONTENT)
  const tag = await fs.readFile(path.join(CACHE, 'CACHEDIR.TAG'), 'utf8')
  t.match(
    tag,
    /^Signature: 8a477f597d28d172789f06886806bc55\n/,
    'cache directory is tagged'
  )
})

t.test('basic stream insertion', async t => {
  const CACHE = t.testdir()
  let int
  const stream = put.stream(CACHE, KEY).on('integrity', (i) => {
    int = i
  })
  await stream.end(CONTENT).promise()
  t.equal(int.toString(), INTEGRITY, 'returned integrity matches expected')
  const data = await fs.readFile(contentPath(CACHE, int))
  t.same(data, CONTENT, 'contents are identical to inserted content')
})

t.test('adds correct entry to index before finishing', async t => {
  const CACHE = t.testdir()
  await put(CACHE, KEY, CONTENT, { metadata: METADATA })
  const entry = await index.find(CACHE, KEY)
  t.ok(entry, 'got an entry')
  t.equal(entry.key, KEY, 'entry has the right key')
  t.equal(entry.integrity, INTEGRITY, 'entry has the right key')
  t.same(entry.metadata, METADATA, 'metadata also inserted')
})

t.test('optionally memoizes data on bulk insertion', async t => {
  const CACHE = t.testdir()
  const integrity = await put(CACHE, KEY, CONTENT, {
    metadata: METADATA,
    memoize: true,
  })
  t.equal(integrity.toString(), INTEGRITY, 'integrity returned as usual')
  const entry = await index.find(CACHE, KEY) // index.find is not memoized
  t.same(
    memo.get(CACHE, KEY),
    {
      data: CONTENT,
      entry: entry,
    },
    'content inserted into memoization cache by key'
  )
  t.same(
    memo.get.byDigest(CACHE, INTEGRITY),
    CONTENT,
    'content inserted into memoization cache by integrity'
  )
})

t.test('optionally memoizes data on stream insertion', async t => {
  const CACHE = t.testdir()
  let int
  const stream = put
    .stream(CACHE, KEY, {
      metadata: METADATA,
      memoize: true,
    })
    .on('integrity', (i) => {
      int = i
    })
  await stream.end(CONTENT).promise()
  t.equal(int.toString(), INTEGRITY, 'integrity emitted as usual')
  const data = await fs.readFile(contentPath(CACHE, int))
  t.same(data, CONTENT, 'contents are identical to inserted content')
  const entry = await index.find(CACHE, KEY) // index.find is not memoized
  t.same(
    memo.get(CACHE, KEY),
    {
      data: CONTENT,
      entry: entry,
    },
    'content inserted into memoization cache by key'
  )
  t.same(
    memo.get.byDigest(CACHE, INTEGRITY),
    CONTENT,
    'content inserted into memoization cache by integrity'
  )
})

t.test('errors if integrity errors', async t => {
  const CACHE = t.testdir()
  await t.rejects(
    put(CACHE, KEY, CONTENT, { integrity: 'sha1-BaDDigEST' }),
    { code: 'EINTEGRITY' },
    'got error from bad integrity'
  )
})

t.test('signals error if error writing to cache', async t => {
  const CACHE = t.testdir()
  const [bulkErr, streamErr] = await Promise.all([
    put(CACHE, KEY, CONTENT, {
      size: 2,
    })
      .then(() => {
        throw new Error('expected to get a bad size error')
      })
      .catch((err) => err),

    put.stream(CACHE, KEY, { size: 2 }).end(CONTENT).promise()
      .then(() => {
        throw new Error('expected to get a bad size error')
      })
      .catch((err) => err),
  ])
  t.equal(bulkErr.code, 'EBADSIZE', 'got error from bulk write')
  t.equal(streamErr.code, 'EBADSIZE', 'got error from stream write')
})

t.test('concurrent puts with identical content', async t => {
  const CACHE = t.testdir()
  await Promise.all([
    put(CACHE, KEY, CONTENT),
    put(CACHE, `${KEY}2`, CONTENT),
    put(CACHE, KEY, CONTENT),
    put(CACHE, `${KEY}2`, CONTENT),
    put(CACHE, KEY, CONTENT),
    put(CACHE, `${KEY}2`, CONTENT),
    put(CACHE, KEY, CONTENT),
    put(CACHE, `${KEY}2`, CONTENT),
    put(CACHE, KEY, CONTENT),
    put(CACHE, `${KEY}2`, CONTENT),
    put(CACHE, KEY, CONTENT),
    put(CACHE, `${KEY}2`, CONTENT),
  ])
  const tmpFiles = await fs.readdir(path.join(CACHE, 'tmp'))
  t.strictSame(tmpFiles, [], 'Nothing left in tmp')
})
