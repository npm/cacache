'use strict'

const CacheContent = require('../util/cache-content')
const memo = require('../../lib/memoization')
const path = require('path')
const Tacks = require('tacks')
const ssri = require('ssri')

const get = require('../../get')

let buf = []
for (let i = 0; i < Math.pow(2, 8); i++) {
  buf.push(Buffer.alloc ? Buffer.alloc(8, i) : new Buffer(8))
}

const CONTENT = Buffer.concat(buf, buf.length * 8)
const INTEGRITY = ssri.fromData(CONTENT)

const arr = []
for (let i = 0; i < 100; i++) {
  arr.push(CONTENT)
}
const BIGCONTENT = Buffer.concat(arr, CONTENT.length * 1000)
const BIGINTEGRITY = ssri.fromData(BIGCONTENT)

module.exports = (suite, CACHE) => {
  suite.add('get.byDigest()', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [INTEGRITY]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      get.byDigest(
        CACHE, INTEGRITY
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })

  suite.add('get.byDigest() memoized', {
    defer: true,
    setup () {
      memo.put.byDigest(CACHE, INTEGRITY, CONTENT)
    },
    fn (deferred) {
      get.byDigest(
        CACHE, INTEGRITY
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    },
    tearDown () {
      memo.clearMemoized()
    }
  })

  suite.add('get.stream.byDigest() small data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [INTEGRITY]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      const stream = get.stream.byDigest(CACHE, INTEGRITY, { memoize: false })
      stream.on('data', () => {})
      stream.on('error', err => deferred.reject(err))
      stream.on('end', () => {
        deferred.resolve()
      })
    }
  })

  suite.add('get.stream.byDigest() big data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [BIGINTEGRITY]: BIGCONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      const stream = get.stream.byDigest(CACHE, BIGINTEGRITY)
      stream.on('data', () => {})
      stream.on('error', err => deferred.reject(err))
      stream.on('end', () => {
        deferred.resolve()
      })
    }
  })

  suite.add('get.copy.byDigest() small data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [INTEGRITY]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      get.copy.byDigest(CACHE, INTEGRITY, path.join(CACHE, 'data'))
      .then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })

  suite.add('get.copy.byDigest() big data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [BIGINTEGRITY]: BIGCONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      get.copy.byDigest(CACHE, BIGINTEGRITY, path.join(CACHE, 'data'))
      .then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })
}
