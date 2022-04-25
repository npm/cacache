'use strict'

const contentPath = require('../../lib/content/path')
const path = require('path')

module.exports = CacheContent

function CacheContent (entries) {
  const tree = {}
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
    tree[key] = content
  } else {
    tree[key] = tree[key] || {}
    insertContent(tree[key], pathTo.slice(1), content)
  }
}
