var get = require('./get')
var path = require('path')
var rimraf = require('rimraf')

module.exports.all = all
function all (cache, cb) {
  rimraf(path.dirname(get.path(cache, 'dummy')), cb)
}

module.exports.entry = entry
function entry (cache, address, cb) {
  rimraf(get.path(cache, address), cb)
}
