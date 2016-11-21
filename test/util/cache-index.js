var hashKey = require('../../lib/entry-index')._hashKey
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
    var lines = entries[k]
    var hashed = hashKey(k)
    var serialised
    if (typeof lines === 'string') {
      serialised = lines
    } else {
      if (typeof lines.length !== 'number') {
        lines = [lines]
      }
      serialised = lines.map(JSON.stringify).join('\n')
    }
    index[hashed] = index[hashed]
    ? [index[hashed], serialised].join('\n')
    : serialised
  })
  Object.keys(index).forEach(function (k) {
    index[k] = File(index[k])
  })
  return Dir(index)
}
