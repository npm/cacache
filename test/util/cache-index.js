'use strict'

const bucketPath = require('../../lib/entry-index')._bucketPath
const path = require('path')
const Tacks = require('tacks')

const Dir = Tacks.Dir
const File = Tacks.File

// Creates a simulated index using the chained lookup structure, from
// an unhashed version of the index (basically `cacache.ls`).
//
// The returned object is for use with Tacks
module.exports = CacheIndex
function CacheIndex (entries, hashAlgorithm) {
  hashAlgorithm = hashAlgorithm || 'sha512'
  var tree = Dir({})
  Object.keys(entries).forEach(function (k) {
    const bpath = bucketPath('', k, hashAlgorithm)
    const parts = bpath.split(path.sep)
    let lines = entries[k]
    let serialised
    if (typeof lines === 'string') {
      serialised = lines
    } else {
      if (typeof lines.length !== 'number') {
        lines = [lines]
      }
      serialised = lines.map(JSON.stringify).join('\n')
    }
    insertContent(tree, parts, serialised)
  })
  return tree
}

function insertContent (tree, pathTo, content) {
  const key = pathTo[0]
  if (pathTo.length <= 1) {
    if (tree.contents[key]) {
      tree.contents[key] = File([
        tree.contents[key].contents,
        content
      ].join('\n'))
    } else {
      tree.contents[key] = File(content)
    }
  } else {
    tree.contents[key] = tree.contents[key] || Dir({})
    insertContent(tree.contents[key], pathTo.slice(1), content)
  }
}
