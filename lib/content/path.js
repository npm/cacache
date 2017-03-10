'use strict'

var contentVer = require('../../package.json')['cache-version'].content
var hashToSegments = require('../util/hash-to-segments')
var path = require('path')

// Current format of content file path:
//
// ~/.my-cache/content-v1/sha512/ba/bada55deadbeefc0ffee
//
module.exports = contentPath
function contentPath (cache, address, hashAlgorithm) {
  address = address && address.toLowerCase()
  hashAlgorithm = hashAlgorithm ? hashAlgorithm.toLowerCase() : 'sha512'
  return path.join.apply(path, [
    cache,
    `content-v${contentVer}`,
    hashAlgorithm,
  ].concat(hashToSegments(address)))
}
