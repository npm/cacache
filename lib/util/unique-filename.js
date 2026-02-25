'use strict'

const crypto = require('node:crypto')
const path = require('path')

module.exports = function uniqueFilename (filepath, prefix, uniq) {
  const slug = uniq
    ? crypto.createHash('sha512').update(uniq).digest('hex').slice(0, 8)
    : crypto.randomBytes(4).toString('hex')
  return path.join(filepath, (prefix ? prefix + '-' : '') + slug)
}
