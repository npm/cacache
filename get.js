'use strict'

const Promise = require('bluebird')

const index = require('./lib/entry-index')
const finished = Promise.promisify(require('mississippi').finished)
const memo = require('./lib/memoization')
const pipe = require('mississippi').pipe
const pipeline = require('mississippi').pipeline
const read = require('./lib/content/read')
const through = require('mississippi').through

module.exports = function get (cache, key, opts) {
  return getData(false, cache, key, opts)
}
module.exports.byDigest = function getByDigest (cache, digest, opts) {
  return getData(true, cache, digest, opts)
}
function getData (byDigest, cache, key, opts) {
  opts = opts || {}
  opts.hashAlgorithm = opts.hashAlgorithm || 'sha1'
  const memoized = (
    byDigest
    ? memo.get.byDigest(cache, key, opts.hashAlgorithm)
    : memo.get(cache, key)
  )
  if (memoized && opts.memoize !== false) {
    return Promise.resolve({
      metadata: memoized.entry.metadata,
      data: memoized.data,
      digest: memoized.entry.digest,
      hashAlgorithm: memoized.entry.hashAlgorithm
    })
  }
  const src = (byDigest ? getStreamDigest : getStream)(cache, key, opts)
  let acc = []
  let dataTotal = 0
  let metadata
  let digest
  let hashAlgorithm
  if (!byDigest) {
    src.on('digest', d => {
      digest = d
    })
    src.on('hashAlgorithm', d => { hashAlgorithm = d })
    src.on('metadata', d => { metadata = d })
  }
  src.on('data', d => {
    acc.push(d)
    dataTotal += d.length
  })
  return finished(src).then(() => {
    const data = Buffer.concat(acc, dataTotal)
    return byDigest ? data : { metadata, data, digest, hashAlgorithm }
  })
}

module.exports.stream = getStream
function getStream (cache, key, opts) {
  opts = opts || {}
  let stream = through()
  const memoized = memo.get(cache, key)
  if (memoized && opts.memoize !== false) {
    stream.on('newListener', function (ev, cb) {
      ev === 'metadata' && cb(memoized.entry.metadata)
      ev === 'digest' && cb(memoized.entry.digest)
      ev === 'hashAlgorithm' && cb(memoized.entry.hashAlgorithm)
    })
    stream.write(memoized.data, () => stream.end())
    return stream
  }
  index.find(cache, key).then(entry => {
    if (!entry) {
      return stream.emit(
        'error', index.notFoundError(cache, key)
      )
    }
    let memoStream
    if (opts.memoize) {
      let memoData = []
      let memoLength = 0
      memoStream = through((c, en, cb) => {
        memoData && memoData.push(c)
        memoLength += c.length
        cb(null, c, en)
      }, cb => {
        memoData && memo.put(cache, entry, Buffer.concat(memoData, memoLength))
        cb()
      })
    } else {
      memoStream = through()
    }
    // TODO - don't overwrite someone else's `opts`.
    opts.hashAlgorithm = entry.hashAlgorithm
    stream.emit('metadata', entry.metadata)
    stream.emit('hashAlgorithm', entry.hashAlgorithm)
    stream.emit('digest', entry.digest)
    stream.on('newListener', function (ev, cb) {
      ev === 'metadata' && cb(entry.metadata)
      ev === 'digest' && cb(entry.digest)
      ev === 'hashAlgorithm' && cb(entry.hashAlgorithm)
    })
    pipe(
      read.readStream(cache, entry.digest, opts),
      memoStream,
      stream
    )
  }, err => stream.emit('error', err))
  return stream
}

module.exports.stream.byDigest = getStreamDigest
function getStreamDigest (cache, digest, opts) {
  opts = opts || {}
  opts.hashAlgorithm = opts.hashAlgorithm || 'sha1'
  const memoized = memo.get.byDigest(cache, digest, opts.hashAlgorithm)
  if (memoized && opts.memoize !== false) {
    const stream = through()
    stream.write(memoized, () => stream.end())
    return stream
  } else {
    let stream = read.readStream(cache, digest, opts)
    if (opts.memoize) {
      let memoData = []
      let memoLength = 0
      const memoStream = through((c, en, cb) => {
        memoData && memoData.push(c)
        memoLength += c.length
        cb(null, c, en)
      }, cb => {
        memoData && memo.put.byDigest(
          cache,
          digest,
          opts.hashAlgorithm,
          Buffer.concat(memoData, memoLength)
        )
        cb()
      })
      stream = pipeline(stream, memoStream)
    }
    return stream
  }
}

module.exports.info = info
function info (cache, key, opts) {
  opts = opts || {}
  const memoized = memo.get(cache, key)
  if (memoized && opts.memoize !== false) {
    return Promise.resolve(memoized.entry)
  } else {
    return index.find(cache, key)
  }
}
