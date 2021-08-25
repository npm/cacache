'use strict'

const util = require('util')
const requireInject = require('require-inject')

const fs = require('fs')
const path = require('path')
const { test } = require('tap')

const CACHE = require('./util/test-dir')(__filename)

const mockedFixOwner = () => Promise.resolve(1)
// temporarily points to original mkdirfix implementation
mockedFixOwner.mkdirfix = require('../lib/util/fix-owner').mkdirfix
const tmp = requireInject('../lib/util/tmp', {
  '../lib/util/fix-owner': mockedFixOwner,
})

const stat = util.promisify(fs.stat)

test('creates a unique tmpdir inside the cache', (t) => {
  return tmp
    .mkdir(CACHE)
    .then((dir) => {
      t.match(
        path.relative(CACHE, dir),
        /^tmp[\\/].*/,
        'returns a path inside tmp'
      )
      return stat(dir)
    })
    .then((s) => {
      t.ok(s.isDirectory(), 'path points to an existing directory')
    })
})

test('provides a utility that does resource disposal on tmp', (t) => {
  return tmp
    .withTmp(CACHE, (dir) => {
      return stat(dir)
        .then((s) => {
          t.ok(s.isDirectory(), 'path points to an existing directory')
        })
        .then(() => dir)
    })
    .then((dir) => {
      return Promise.all([
        stat(dir)
          .then(() => {
            throw new Error('expected fail')
          })
          .catch((err) => {
            if (err.code === 'ENOENT')
              return undefined

            throw err
          }),
        stat(path.join(CACHE, 'tmp')),
      ]).then(([nope, yes]) => {
        t.notOk(nope, 'tmp subdir removed')
        t.ok(yes.isDirectory(), 'tmp parent dir left intact')
      })
    })
})

test('withTmp should accept both opts and cb params', t => {
  return tmp.withTmp(CACHE, { tmpPrefix: 'foo' }, dir => {
    t.ok(dir, 'dir should contain a valid response')
  })
})

test('provides a function for fixing ownership in the tmp dir', t => {
  return tmp.fix(CACHE).then(res => {
    t.ok(res, 'fixOwner is successfully called')
  })
})
