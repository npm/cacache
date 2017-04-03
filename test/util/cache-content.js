'use strict'

const contentPath = require('../../lib/content/path')
const path = require('path')
const Tacks = require('tacks')

const Dir = Tacks.Dir
const File = Tacks.File

module.exports = CacheContent
function CacheContent (entries) {
  var tree = Dir({})
  Object.keys(entries).forEach(function (k) {
    const cpath = contentPath('', k)
    const content = entries[k]
    const parts = cpath.split(path.sep)
    insertContent(tree, parts, content)
  })
  return tree
}

function insertContent (tree, pathTo, content) {
  const key = pathTo[0]
  if (pathTo.length <= 1) {
    tree.contents[key] = File(content)
  } else {
    tree.contents[key] = tree.contents[key] || Dir({})
    insertContent(tree.contents[key], pathTo.slice(1), content)
  }
}
