'use strict'

const LRU = require('lru-cache')

const MAX_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_AGE = 3 * 60 * 1000

let MEMOIZED
clearMemoized()

module.exports.clearMemoized = clearMemoized
function clearMemoized () {
  var old = MEMOIZED
  MEMOIZED = new LRU({
    max: MAX_SIZE,
    maxAge: MAX_AGE,
    length: (entry, key) => {
      if (key.startsWith('key:')) {
        return entry.data.length
      } else if (key.startsWith('digest:')) {
        return entry.length
      }
    }
  })
  return old
}

module.exports.put = put
function put (cache, entry, data) {
  MEMOIZED[`key:${cache}:${entry.key}`] = { entry, data }
  putDigest(cache, entry.digest, entry.hashAlgorithm, data)
}

module.exports.put.byDigest = putDigest
function putDigest (cache, digest, algo, data) {
  MEMOIZED[`digest:${cache}:${algo}:${digest}`] = data
}

module.exports.get = get
function get (cache, key) {
  return MEMOIZED[`key:${cache}:${key}`]
}

module.exports.get.byDigest = getDigest
function getDigest (cache, digest, algo) {
  return MEMOIZED[`digest:${cache}:${algo}:${digest}`]
}
