'use strict'

const util = require('util')

const fs = require('graceful-fs')
const path = require('path')
const test = require('tap').test

const CACHE = require('./util/test-dir')(__filename)

const tmp = require('../lib/util/tmp')

const stat = util.promisify(fs.stat)

test('creates a unique tmpdir inside the cache', t => {
  return tmp.mkdir(CACHE).then((dir) => {
    t.match(path.relative(CACHE, dir), /^tmp[\\/].*/, 'returns a path inside tmp')
    return stat(dir)
  }).then((s) => {
    t.ok(s.isDirectory(), 'path points to an existing directory')
  })
})

test('provides a utility that does resource disposal on tmp', t => {
  return tmp.withTmp(CACHE, dir => {
    return stat(dir).then((s) => {
      t.ok(s.isDirectory(), 'path points to an existing directory')
    }).then(() => dir)
  }).then((dir) => {
    return Promise.all([
      stat(dir).then(() => {
        throw new Error('expected fail')
      }).catch((err) => {
        if (err.code === 'ENOENT') {
          return undefined
        }
        throw err
      }),
      stat(path.join(CACHE, 'tmp'))
    ]).then(([nope, yes]) => {
      t.notOk(nope, 'tmp subdir removed')
      t.ok(yes.isDirectory(), 'tmp parent dir left intact')
    })
  })
})

test('makes sure ownership is correct')
test('provides a function for fixing ownership in the tmp dir')
