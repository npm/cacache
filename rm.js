'use strict'

const Promise = require('bluebird')

const rmContent = require('./lib/content/rm')
const index = require('./lib/entry-index')
const rimraf = Promise.promisify(require('rimraf'))

module.exports.all = all
function all (cache) {
  return rimraf(cache)
}

module.exports.entry = entry
function entry (cache, key) {
  return index.delete(cache, key)
}

module.exports.content = content
function content (cache, address) {
  return rmContent(cache, address)
}
