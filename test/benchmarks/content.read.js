'use strict'

const BB = require('bluebird')

const CacheContent = require('../util/cache-content')
const fs = require('fs')
const path = require('path')
const Tacks = require('tacks')
const ssri = require('ssri')
const read = require('../../lib/content/read')

const writeFile = BB.promisify(fs.writeFile)

const buf = []
for (let i = 0; i < Math.pow(2, 8); i++) {
  buf.push(Buffer.alloc(8, i))
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
  suite.add('content.read()', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [INTEGRITY]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      read(
        CACHE, INTEGRITY
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })

  suite.add('content.read() big data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [BIGINTEGRITY]: BIGCONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      read(
        CACHE, BIGINTEGRITY
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })

  suite.add('content.read.copy() small data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [INTEGRITY]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      if (read.copy) {
        read.copy(CACHE, INTEGRITY, path.join(CACHE, 'data'))
          .then(
            () => deferred.resolve(),
            err => deferred.reject(err)
          )
      } else {
        read(CACHE, INTEGRITY)
          .then((data) => writeFile(path.join(CACHE, 'data'), data))
          .then(
            () => deferred.resolve(),
            err => deferred.reject(err)
          )
      }
    }
  })

  suite.add('content.read.copy() big data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [BIGINTEGRITY]: BIGCONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      if (read.copy) {
        read.copy(CACHE, BIGINTEGRITY, path.join(CACHE, 'bigdata'))
          .then(
            () => deferred.resolve(),
            err => deferred.reject(err)
          )
      } else {
        read(CACHE, BIGINTEGRITY)
          .then((data) => writeFile(path.join(CACHE, 'bigdata'), data))
          .then(
            () => deferred.resolve(),
            err => deferred.reject(err)
          )
      }
    }
  })

  suite.add('content.read.stream() small data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [INTEGRITY]: CONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      const stream = read.stream(CACHE, INTEGRITY)
      stream.on('data', () => {})
      stream.on('error', err => deferred.reject(err))
      stream.on('end', () => {
        deferred.resolve()
      })
    }
  })

  suite.add('content.read.stream() big data', {
    defer: true,
    setup () {
      const fixture = new Tacks(CacheContent({
        [BIGINTEGRITY]: BIGCONTENT
      }))
      fixture.create(CACHE)
    },
    fn (deferred) {
      const stream = read.stream(CACHE, BIGINTEGRITY)
      stream.on('data', () => {})
      stream.on('error', err => deferred.reject(err))
      stream.on('end', () => {
        deferred.resolve()
      })
    }
  })
}
