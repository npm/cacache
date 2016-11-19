var get = require('./get')
var index = require('./index')
var rimraf = require('rimraf')

module.exports.all = all
function all (cache, cb) {
  rimraf(cache, cb)
}

module.exports.entry = entry
function entry (cache, key, address, cb) {
  index.delete(cache, key, address, cb)
}

module.exports.content = content
function content (cache, address, cb) {
  rimraf(get.path(cache, address), cb)
}

module.exports.gc = gc
function gc (cache) {
  throw new Error('garbage collection not implemented yet')
}
