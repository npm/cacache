'use strict'

let MEMOIZED = {}

module.exports.clearMemoized = clearMemoized
function clearMemoized () {
  var old = MEMOIZED
  MEMOIZED = {}
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
