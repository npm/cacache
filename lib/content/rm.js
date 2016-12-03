var contentPath = require('./path')
var rimraf = require('rimraf')

module.exports = rm
function rm (cache, address, cb) {
  rimraf(contentPath(cache, address), cb)
}
