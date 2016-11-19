var copy = require('fs-extra').copy
var contentPath = require('./util').contentPath

module.exports.path = contentPath

module.exports.extract = extract
function extract (cache, address, destination, opts, cb) {
  copy(contentPath(cache, address), destination, opts, cb)
}
