'use strict'

const CacheIndex = require('../util/cache-index')
const Tacks = require('tacks')

const index = require('../../lib/entry-index')

module.exports = (suite, CACHE) => {
  suite.add('index.find cache hit', {
    defer: true,
    fn (deferred) {
      index.find(
        CACHE, this.entry.key
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    },
    onStart () {
      const entry = {
        key: 'whatever',
        integrity: 'sha512-deadbeef',
        time: 12345,
        metadata: 'omgsometa'
      }
      const fixture = new Tacks(CacheIndex({
        'whatever': entry
      }))
      fixture.create(CACHE)
      this.fixture = fixture
      this.entry = entry
    }
  })

  suite.add('index.find cache miss', {
    defer: true,
    fn (deferred) {
      index.find(
        CACHE, 'whatever'
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    },
    onStart () {
      const fixture = new Tacks(CacheIndex({
        'foo': {key: 'foo'},
        'w/e': {key: 'w/e'}
      }))
      fixture.create(CACHE)
      this.fixture = fixture
    }
  })
}
