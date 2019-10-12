'use strict'

const contentVer = require('../../package.json')['cache-version'].content
const path = require('path')
const ssri = require('ssri')

// Current format of content file path:
//
// sha512-BaSE64Hex= ->
// ~/.my-cache/content-v3/sha512-bada55deadbeefc0ffee
//
module.exports = contentPath

function contentPath (cache, integrity) {
  const sri = ssri.parse(integrity, { single: true })
  // contentPath is the *strongest* algo given
  return path.join(
    contentDir(cache),
    sri.algorithm + '-' + sri.hexDigest()
  )
}

module.exports.contentDir = contentDir

function contentDir (cache) {
  return path.join(cache, `content-v${contentVer}`)
}
