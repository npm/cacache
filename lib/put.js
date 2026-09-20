'use strict'

const { Readable } = require('stream')
const index = require('./entry-index')
const memo = require('./memoization')
const write = require('./content/write')
const Flush = require('minipass-flush')
const { PassThrough } = require('minipass-collect')
const Pipeline = require('minipass-pipeline')

const putOpts = (opts) => ({
  algorithms: ['sha512'],
  ...opts,
})

const SUPPORTED_PUT_TYPES = 'string, Buffer, Uint8Array, ArrayBuffer, Blob, Response, or stream'

module.exports = putData

async function putData (cache, key, data, opts = {}) {
  const stream = toPutStream(data)
  if (stream) {
    return putFromStream(cache, key, stream, opts)
  }

  data = await coercePutData(data)

  const { memoize } = opts
  opts = putOpts(opts)
  const res = await write(cache, data, opts)
  const entry = await index.insert(cache, key, res.integrity, { ...opts, size: res.size })
  if (memoize) {
    memo.put(cache, entry, data, opts)
  }

  return res.integrity
}

async function putFromStream (cache, key, input, opts) {
  const dest = putStream(cache, key, opts)
  let integrity
  dest.on('integrity', (int) => {
    integrity = int
  })
  input.once('error', (err) => dest.emit('error', err))
  input.pipe(dest)
  await dest.promise()
  return integrity
}

function toPutStream (data) {
  if (!data || typeof data !== 'object') {
    return null
  }

  // Response/Blob go through arrayBuffer() so empty bodies stay valid puts.
  // Callers can still pass a web ReadableStream (e.g. response.body) directly.
  if (isResponseLike(data) || isBlobLike(data)) {
    return null
  }

  if (typeof data.pipe === 'function' && typeof data.on === 'function') {
    return data
  }

  if (isWebReadableStream(data)) {
    return readableFromWeb(data)
  }

  return null
}

function readableFromWeb (webStream) {
  return Readable.fromWeb(webStream)
}

function isWebReadableStream (data) {
  return typeof data.getReader === 'function' &&
    typeof data.tee === 'function' &&
    typeof data.cancel === 'function'
}

async function coercePutData (data) {
  if (typeof data === 'string' || Buffer.isBuffer(data)) {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }

  if (isResponseLike(data) || isBlobLike(data)) {
    return Buffer.from(await data.arrayBuffer())
  }

  throw badPutTypeError(data)
}

function isResponseLike (data) {
  if (!data || typeof data !== 'object') {
    return false
  }
  if (data instanceof Response) {
    return true
  }
  return typeof data.arrayBuffer === 'function' &&
    'body' in data &&
    (typeof data.status === 'number' || typeof data.ok === 'boolean')
}

function isBlobLike (data) {
  if (!data || typeof data !== 'object') {
    return false
  }
  if (data instanceof Blob) {
    return true
  }
  return typeof data.arrayBuffer === 'function' &&
    typeof data.size === 'number' &&
    typeof data.type === 'string' &&
    typeof data.slice === 'function'
}

function badPutTypeError (data) {
  const err = new TypeError(
    `cacache.put() data must be a ${SUPPORTED_PUT_TYPES}. Received ${describeType(data)}`
  )
  err.code = 'EBADTYPE'
  return err
}

function describeType (data) {
  if (data === null) {
    return 'null'
  }
  if (typeof data !== 'object') {
    return typeof data
  }
  if (data.constructor && data.constructor.name) {
    return data.constructor.name
  }
  return 'Object'
}

module.exports.stream = putStream

function putStream (cache, key, opts = {}) {
  const { memoize } = opts
  opts = putOpts(opts)
  let integrity
  let size
  let error

  let memoData
  const pipeline = new Pipeline()
  // first item in the pipeline is the memoizer, because we need
  // that to end first and get the collected data.
  if (memoize) {
    const memoizer = new PassThrough().on('collect', data => {
      memoData = data
    })
    pipeline.push(memoizer)
  }

  // contentStream is a write-only, not a passthrough
  // no data comes out of it.
  const contentStream = write.stream(cache, opts)
    .on('integrity', (int) => {
      integrity = int
    })
    .on('size', (s) => {
      size = s
    })
    .on('error', (err) => {
      error = err
    })

  pipeline.push(contentStream)

  // last but not least, we write the index and emit hash and size,
  // and memoize if we're doing that
  pipeline.push(new Flush({
    async flush () {
      if (!error) {
        const entry = await index.insert(cache, key, integrity, { ...opts, size })
        if (memoize && memoData) {
          memo.put(cache, entry, memoData, opts)
        }
        pipeline.emit('integrity', integrity)
        pipeline.emit('size', size)
      }
    },
  }))

  return pipeline
}
