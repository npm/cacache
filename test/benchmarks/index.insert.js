'use strict'

const KEY = 'foo'
const INTEGRITY = 'sha512-deadbeef'
const ALGO = 'whatnot'

const index = require('../../lib/entry-index')

module.exports = (suite, CACHE) => {
  suite.add('index.insert() different files', {
    defer: true,
    fn (deferred) {
      index.insert(CACHE, KEY + this.count, INTEGRITY, {
        metadata: 'foo'
      }).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })
  suite.add('index.insert() same file', {
    defer: true,
    fn (deferred) {
      index.insert(CACHE, KEY, INTEGRITY, {
        metadata: 'foo',
        hashAlgorithm: ALGO
      }).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })
}
