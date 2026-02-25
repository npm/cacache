'use strict'

const path = require('path')
const t = require('tap')

const uniqueFilename = require('../../lib/util/unique-filename.js')

t.test('returns a path in the given directory with no prefix', async t => {
  const result = uniqueFilename('/tmp')
  t.equal(path.dirname(result), '/tmp', 'file is in the specified directory')
  t.match(path.basename(result), /^[a-f0-9]{8}$/, 'random hex slug')
})

t.test('returns a unique path each time (random)', async t => {
  const a = uniqueFilename('/tmp')
  const b = uniqueFilename('/tmp')
  t.not(a, b, 'two calls produce different paths')
})

t.test('uses prefix when provided', async t => {
  const result = uniqueFilename('/tmp', 'my-prefix')
  t.match(path.basename(result), /^my-prefix-[a-f0-9]{8}$/, 'basename starts with prefix')
})

t.test('returns deterministic slug when uniq is provided', async t => {
  const a = uniqueFilename('/tmp', '', 'unique-value')
  const b = uniqueFilename('/tmp', '', 'unique-value')
  t.equal(a, b, 'same uniq produces the same path')
  t.match(path.basename(a), /^[a-f0-9]{8}$/, 'slug is 8 hex chars')
})

t.test('uses both prefix and uniq together', async t => {
  const result = uniqueFilename('/tmp', 'pfx', 'unique-value')
  t.match(path.basename(result), /^pfx-[a-f0-9]{8}$/, 'prefix and deterministic slug')
})
