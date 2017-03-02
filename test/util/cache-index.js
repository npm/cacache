'use strict'

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
    var prefix = hashed.slice(0, 2)
    var serialised
    if (typeof lines === 'string') {
      serialised = lines
    } else {
      if (typeof lines.length !== 'number') {
        lines = [lines]
      }
      serialised = lines.map(JSON.stringify).join('\n')
    }
    index[prefix] = index[prefix] || {}
    index[prefix][hashed] = index[prefix][hashed]
    ? [index[prefix][hashed], serialised].join('\n')
    : serialised
  })
  Object.keys(index).forEach(function (prefix) {
    var files = {}
    Object.keys(index[prefix]).forEach(key => {
      files[key] = File(index[prefix][key])
    })
    index[prefix] = Dir(files)
  })
  return Dir(index)
}
