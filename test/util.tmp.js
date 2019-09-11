'use strict'

const BB = require('bluebird')
const requireInject = require('require-inject')

const fs = BB.promisifyAll(require('graceful-fs'))
const path = require('path')
const test = require('tap').test

const CACHE = require('./util/test-dir')(__filename)

const mockedFixOwner = () => Promise.resolve(1)
// temporarily points to original mkdirfix implementation
mockedFixOwner.mkdirfix = require('../lib/util/fix-owner').mkdirfix
const tmp = requireInject('../lib/util/tmp', {
  '../lib/util/fix-owner': mockedFixOwner
})

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

test('withTmp should accept both opts and cb params', t => {
  return tmp.withTmp(CACHE, { tmpPrefix: {} }, dir => {
    t.ok(dir, 'dir should contain a valid response')
  })
})

test('provides a function for fixing ownership in the tmp dir', t => {
  return tmp.fix(CACHE).then(res => {
    t.ok(res, 'fixOwner is successfully called')
  })
})
