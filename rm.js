'use strict'

var rmContent = require('./lib/content/rm')
var index = require('./lib/entry-index')
var rimraf = require('rimraf')

module.exports.all = all
function all (cache, cb) {
  rimraf(cache, cb)
}

module.exports.entry = entry
function entry (cache, key, cb) {
  index.delete(cache, key, cb)
}

module.exports.content = content
function content (cache, address, cb) {
  rmContent(cache, address, cb)
}
