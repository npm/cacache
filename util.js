var path = require('path')

module.exports.contentPath = contentPath
function contentPath (cache, address) {
  return path.join(cache, 'content', address)
}
