'use strict'

const Promise = require('bluebird')

const index = require('./lib/entry-index')
const memo = require('./lib/memoization')
const pipe = Promise.promisify(require('mississippi').pipe)
const putContent = require('./lib/content/put-stream')
const through = require('mississippi').through
const to = require('mississippi').to

module.exports = putData
function putData (cache, key, data, opts) {
  opts = opts || {}
  const src = through()
  let digest
  const dest = putStream(cache, key, opts)
  dest.on('digest', d => { digest = d })
  const ret = pipe(src, dest).then(() => digest)
  src.write(data, () => src.end())
  return ret
}

module.exports.stream = putStream
function putStream (cache, key, opts) {
  opts = opts || {}
  let digest
  const contentStream = putContent(cache, opts).on('digest', function (d) {
    digest = d
  })
  let memoData
  let memoTotal = 0
  const stream = to((chunk, enc, cb) => {
    contentStream.write(chunk, enc, () => {
      if (opts.memoize) {
        if (!memoData) { memoData = [] }
        memoData.push(chunk)
        memoTotal += chunk.length
      }
      cb()
    })
  }, cb => {
    contentStream.end(() => {
      index.insert(cache, key, digest, opts).then(entry => {
        if (opts.memoize) {
          memo.put(cache, entry, Buffer.concat(memoData, memoTotal))
        }
        stream.emit('digest', digest)
        cb()
      })
    })
  })
  let erred = false
  stream.once('error', err => {
    if (erred) { return }
    erred = true
    contentStream.emit('error', err)
  })
  contentStream.once('error', err => {
    if (erred) { return }
    erred = true
    stream.emit('error', err)
  })
  return stream
}
