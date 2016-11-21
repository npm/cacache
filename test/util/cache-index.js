var crypto = require('crypto')
var Tacks = require('tacks')

var Dir = Tacks.Dir
var File = Tacks.File

// Creates a simulated index using the chained lookup structure, from
// an unhashed version of the index (basically `cacache.ls`).
//
// The returned object is for use with Tacks
module.exports = CacheIndex
function CacheIndex (entries) {
  var index = {}
  Object.keys(entries).forEach(function (k) {
    var hashed = crypto.createHash(
      'sha1'
    ).update(
      entries[k].key
    ).digest('hex')
    var serialised = JSON.stringify(entries[k])
    index[hashed] = index[hashed]
    ? [index[hashed], serialised].join('\n')
    : serialised
  })
  Object.keys(index).forEach(function (k) {
    index[k] = File(index[k])
  })
  return Dir(index)
}
