'use strict'

module.exports = bufferise
function bufferise (string) {
  return Buffer.from
  ? Buffer.from(string, 'utf8')
  : new Buffer(string, 'utf8')
}
