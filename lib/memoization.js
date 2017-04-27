'use strict'

const LRU = require('lru-cache')

const MAX_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_AGE = 3 * 60 * 1000

let MEMOIZED = new LRU({
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

module.exports.clearMemoized = clearMemoized
function clearMemoized () {
  const old = {}
  MEMOIZED.forEach((v, k) => {
    old[k] = v
  })
  MEMOIZED.reset()
  return old
}

module.exports.put = put
function put (cache, entry, data) {
  MEMOIZED.set(`key:${cache}:${entry.key}`, { entry, data })
  putDigest(cache, entry.integrity, data)
}

module.exports.put.byDigest = putDigest
function putDigest (cache, integrity, data) {
  MEMOIZED.set(`digest:${cache}:${integrity}`, data)
}

module.exports.get = get
function get (cache, key) {
  return MEMOIZED.get(`key:${cache}:${key}`)
}

module.exports.get.byDigest = getDigest
function getDigest (cache, integrity) {
  return MEMOIZED.get(`digest:${cache}:${integrity}`)
}
