'use strict'

const Buffer = require('safe-buffer').Buffer
const BB = require('bluebird')

const crypto = require('crypto')
const fromString = require('./util/from-string')
const fs = BB.promisifyAll(require('fs'))
const index = require('../lib/entry-index')
const memo = require('../lib/memoization')
const path = require('path')
const pipe = BB.promisify(require('mississippi').pipe)
const test = require('tap').test
const testDir = require('./util/test-dir')(__filename)

const CACHE = path.join(testDir, 'cache')
const CONTENT = Buffer.from('foobarbaz', 'utf8')
const KEY = 'my-test-key'
const ALGO = 'sha512'
const DIGEST = crypto.createHash(ALGO).update(CONTENT).digest('hex')
const METADATA = { foo: 'bar' }
const contentPath = require('../lib/content/path')

var put = require('..').put

test('basic bulk insertion', t => {
  return put(CACHE, KEY, CONTENT).then(digest => {
    t.equal(digest, DIGEST, 'returned content digest')
    const dataPath = contentPath(CACHE, digest, ALGO)
    return fs.readFileAsync(dataPath)
  }).then(data => {
    t.deepEqual(data, CONTENT, 'content was correctly inserted')
  })
})

test('basic stream insertion', t => {
  let foundDigest
  const src = fromString(CONTENT)
  const stream = put.stream(CACHE, KEY).on('digest', function (d) {
    foundDigest = d
  })
  return pipe(src, stream).then(() => {
    t.equal(foundDigest, DIGEST, 'returned digest matches expected')
    return fs.readFileAsync(contentPath(CACHE, foundDigest))
  }).then(data => {
    t.deepEqual(data, CONTENT, 'contents are identical to inserted content')
  })
})

test('adds correct entry to index before finishing', t => {
  return put(CACHE, KEY, CONTENT, {metadata: METADATA}).then(() => {
    return index.find(CACHE, KEY)
  }).then(entry => {
    t.ok(entry, 'got an entry')
    t.equal(entry.key, KEY, 'entry has the right key')
    t.equal(entry.digest, DIGEST, 'entry has the right key')
    t.deepEqual(entry.metadata, METADATA, 'metadata also inserted')
  })
})

test('optionally memoizes data on bulk insertion', t => {
  return put(CACHE, KEY, CONTENT, {
    metadata: METADATA,
    hashAlgorithm: ALGO,
    memoize: true
  }).then(digest => {
    t.equal(digest, DIGEST, 'digest returned as usual')
    return index.find(CACHE, KEY) // index.find is not memoized
  }).then(entry => {
    t.deepEqual(memo.get(CACHE, KEY), {
      data: CONTENT,
      entry: entry
    }, 'content inserted into memoization cache by key')
    t.deepEqual(
      memo.get.byDigest(CACHE, DIGEST, ALGO),
      CONTENT,
      'content inserted into memoization cache by digest'
    )
  })
})

test('optionally memoizes data on stream insertion', t => {
  let foundDigest
  const src = fromString(CONTENT)
  const stream = put.stream(CACHE, KEY, {
    hashAlgorithm: ALGO,
    metadata: METADATA,
    memoize: true
  }).on('digest', function (d) {
    foundDigest = d
  })
  return pipe(src, stream).then(() => {
    t.equal(foundDigest, DIGEST, 'digest emitted as usual')
    return fs.readFileAsync(contentPath(CACHE, foundDigest))
  }).then(data => {
    t.deepEqual(data, CONTENT, 'contents are identical to inserted content')
    return index.find(CACHE, KEY) // index.find is not memoized
  }).then(entry => {
    t.deepEqual(memo.get(CACHE, KEY), {
      data: CONTENT,
      entry: entry
    }, 'content inserted into memoization cache by key')
    t.deepEqual(
      memo.get.byDigest(CACHE, DIGEST, ALGO),
      CONTENT,
      'content inserted into memoization cache by digest'
    )
  })
})

test('signals error if error writing to cache', t => {
  return BB.join(
    put(CACHE, KEY, CONTENT, {
      size: 2
    }).then(() => {
      throw new Error('expected error')
    }).catch(err => err),
    pipe(fromString(CONTENT), put.stream(CACHE, KEY, {
      size: 2
    })).then(() => {
      throw new Error('expected error')
    }).catch(err => err),
    (bulkErr, streamErr) => {
      t.equal(bulkErr.code, 'EBADSIZE', 'got error from bulk write')
      t.equal(streamErr.code, 'EBADSIZE', 'got error from stream write')
    }
  )
})

test('errors if input stream errors', function (t) {
  let foundDigest
  const putter = put.stream(CACHE, KEY).on('digest', function (d) {
    foundDigest = d
  })
  const stream = fromString(false)
  return pipe(
    stream, putter
  ).then(() => {
    throw new Error('expected error')
  }).catch(err => {
    t.ok(err, 'got an error')
    t.ok(!foundDigest, 'no digest returned')
    t.match(
      err.message,
      /Invalid non-string/,
      'returns the error from input stream'
    )
    return fs.readdirAsync(testDir)
  }).then(files => {
    t.deepEqual(files, [], 'no files created')
  })
})
