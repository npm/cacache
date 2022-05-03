'use strict'

const index = require('../../lib/entry-index')
const path = require('path')

const bucketPath = index.bucketPath
const hashEntry = index.hashEntry

// Creates a simulated index using the chained lookup structure, from
// an unhashed version of the index (basically `cacache.ls`).
//
// The returned object is for use with Tacks
module.exports = CacheIndex

function CacheIndex (entries) {
  const tree = {}
  Object.keys(entries).forEach(function (k) {
    const bpath = bucketPath('', k)
    const parts = bpath.split(path.sep)
    let lines = entries[k]
    let serialised
    if (typeof lines === 'string') {
      serialised = lines
    } else {
      if (typeof lines.length !== 'number') {
        lines = [lines]
      }

      serialised =
        '\n' +
        lines
          .map((line) => {
            const stringified = JSON.stringify(line)
            return `${hashEntry(stringified)}\t${stringified}`
          })
          .join('\n')
    }
    insertContent(tree, parts, serialised)
  })
  return tree
}

function insertContent (tree, pathTo, content) {
  const key = pathTo[0]
  if (pathTo.length <= 1) {
    if (tree[key]) {
      tree[key] = [tree[key], content].join('\n')
    } else {
      tree[key] = content
    }
  } else {
    tree[key] = tree[key] || {}
    insertContent(tree[key], pathTo.slice(1), content)
  }
}
