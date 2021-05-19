'use strict'

const mkdirp = require('mkdirp')
const path = require('path')
const { promisify } = require('util')
const rimraf = promisify(require('rimraf'))
const tap = require('tap')

const cacheDir = path.resolve(__dirname, '../cache')

module.exports = testDir

function testDir (filename) {
  const base = path.basename(filename, '.js')
  const dir = path.join(cacheDir, base)
  tap.beforeEach(() => reset(dir))
  if (!process.env.KEEPCACHE) {
    tap.teardown(async () => {
      process.chdir(__dirname)
      // This is ok cause this is the last
      // thing to run in the process
      await rimraf(dir).catch(er => {})
    })
  }
  return dir
}

module.exports.reset = reset

async function reset (testDir) {
  process.chdir(__dirname)
  await rimraf(testDir)
  await mkdirp(testDir)
  process.chdir(testDir)
}
