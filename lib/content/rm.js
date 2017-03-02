'use strict'

var Promise = require('bluebird')

var contentPath = require('./path')
var rimraf = Promise.promisify(require('rimraf'))

module.exports = rm
function rm (cache, address, algorithm) {
  address = address.toLowerCase()
  algorithm = algorithm && algorithm.toLowerCase()
  return rimraf(contentPath(cache, address, algorithm || 'sha512'))
}
