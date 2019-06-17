'use strict'

const BB = require('bluebird')

const fs = BB.promisifyAll(require('graceful-fs'))
const path = require('path')
const test = require('tap').test

const CACHE = require('./util/test-dir')(__filename)

const tmp = require('../lib/util/tmp')

test('creates a unique tmpdir inside the cache', t => {
  return tmp.mkdir(CACHE).then(dir => {
    t.match(path.relative(CACHE, dir), /^tmp[\\/].*/, 'returns a path inside tmp')
    return fs.statAsync(dir)
  }).then(stat => {
    t.ok(stat.isDirectory(), 'path points to an existing directory')
  })
})

test('provides a utility that does resource disposal on tmp', t => {
  return tmp.withTmp(CACHE, dir => {
    return fs.statAsync(dir).then(stat => {
      t.ok(stat.isDirectory(), 'path points to an existing directory')
    }).then(() => dir)
  }).then(dir => {
    return BB.join(
      fs.statAsync(dir).then(() => {
        throw new Error('expected fail')
      }).catch({ code: 'ENOENT' }, () => {}),
      fs.statAsync(path.join(CACHE, 'tmp')),
      (nope, yes) => {
        t.notOk(nope, 'tmp subdir removed')
        t.ok(yes.isDirectory(), 'tmp parent dir left intact')
      }
    )
  })
})

test('makes sure ownership is correct')
test('provides a function for fixing ownership in the tmp dir')
