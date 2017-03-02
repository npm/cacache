'use strict'

var path = require('path')

module.exports = contentPath
function contentPath (cache, address, hashAlgorithm) {
  address = address && address.toLowerCase()
  hashAlgorithm = hashAlgorithm ? hashAlgorithm.toLowerCase() : 'sha512'
  return path.join(
    cache, 'content', hashAlgorithm, address.slice(0, 2), address)
}
