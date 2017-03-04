'use strict'

const KEY = 'foo'
const DIGEST = 'deadbeef'
const ALGO = 'whatnot'

const index = require('../../lib/entry-index')

module.exports = (suite, CACHE) => {
  suite.add('index.insert() different files', {
    defer: true,
    fn (deferred) {
      index.insert(CACHE, KEY + this.count, DIGEST, {
        metadata: 'foo',
        hashAlgorithm: ALGO
      }).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })
  suite.add('index.insert() same file', {
    defer: true,
    fn (deferred) {
      index.insert(CACHE, KEY, DIGEST, {
        metadata: 'foo',
        hashAlgorithm: ALGO
      }).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })
}
