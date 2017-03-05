'use strict'

const CacheContent = require('../util/cache-content')
const crypto = require('crypto')
const memo = require('../../lib/memoization')
const Tacks = require('tacks')

const get = require('../../get')

let buf = []
for (let i = 0; i < Math.pow(2, 8); i++) {
  buf.push(Buffer.alloc ? Buffer.alloc(8, i) : new Buffer(8))
}

const CONTENT = Buffer.concat(buf, buf.length * 8)
const DIGEST = crypto.createHash('sha512').update(CONTENT).digest('hex')

const arr = []
for (let i = 0; i < 100; i++) {
  arr.push(CONTENT)
}
const BIGCONTENT = Buffer.concat(arr, CONTENT.length * 1000)
const BIGDIGEST = crypto.createHash('sha512').update(BIGCONTENT).digest('hex')

module.exports = (suite, CACHE) => {
  suite.add('get.byDigest()', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [DIGEST]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      get.byDigest(
        CACHE, DIGEST
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })

  suite.add('get.byDigest() memoized', {
    defer: true,
    setup () {
      memo.put.byDigest(CACHE, DIGEST, 'sha512', CONTENT)
    },
    fn (deferred) {
      get.byDigest(
        CACHE, DIGEST
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
        [DIGEST]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      const stream = get.stream.byDigest(CACHE, DIGEST, { memoize: false })
      stream.on('data', () => {})
      stream.on('error', err => deferred.reject(err))
      stream.on('end', () => {
        deferred.resolve()
      })
    }
  })

  suite.add('get.stream() big data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [BIGDIGEST]: BIGCONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      const stream = get.stream.byDigest(CACHE, BIGDIGEST)
      stream.on('data', () => {})
      stream.on('error', err => deferred.reject(err))
      stream.on('end', () => {
        deferred.resolve()
      })
    }
  })
}
