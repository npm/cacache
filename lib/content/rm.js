'use strict'

var Promise = require('bluebird')

var contentPath = require('./path')
var rimraf = Promise.promisify(require('rimraf'))

module.exports = rm
function rm (cache, address) {
  return rimraf(contentPath(cache, address))
}
