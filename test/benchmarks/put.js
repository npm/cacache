'use strict'

const BB = require('bluebird')

const finished = BB.promisify(require('mississippi').finished)

let buf = []
for (let i = 0; i < Math.pow(2, 8); i++) {
  buf.push(Buffer.alloc(8, i))
}

const CONTENT = Buffer.concat(buf, buf.length * 8)
const arr = []
for (let i = 0; i < 100; i++) {
  arr.push(CONTENT)
}
const BIGCONTENT = Buffer.concat(arr, CONTENT.length * 1000)
const KEY = 'my-test-key'

var put = require('../../put')

module.exports = (suite, CACHE) => {
  suite.add('cacache.put()', {
    defer: true,
    fn (deferred) {
      put(
        CACHE, KEY + this.count, CONTENT + this.count
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })

  suite.add('cacache.put() big data', {
    defer: true,
    fn (deferred) {
      put(
        CACHE, KEY + this.count, BIGCONTENT + this.count
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
    }
  })

  suite.add(`cacache.put.stream() ${CONTENT.length} bytes`, {
    defer: true,
    fn (deferred) {
      const stream = put.stream(CACHE, KEY + this.count)
      finished(
        stream
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
      stream.write(CONTENT + this.count)
      stream.end()
    }
  })

  suite.add(`cacache.put.stream() ${BIGCONTENT.length} bytes`, {
    defer: true,
    minSamples: 30,
    maxTime: 30,
    fn (deferred) {
      const stream = put.stream(CACHE, KEY + this.count)
      finished(
        stream
      ).then(
        () => deferred.resolve(),
        err => deferred.reject(err)
      )
      stream.write(BIGCONTENT + this.count)
      stream.end()
    }
  })
}
