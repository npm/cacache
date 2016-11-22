var mkdirp = require('mkdirp')
var path = require('path')
var rimraf = require('rimraf')
var tap = require('tap')

var cacheDir = path.resolve(__dirname, '../cache')

module.exports = testDir
function testDir (filename) {
  var dir = path.join(cacheDir, path.basename(filename, '.js'))
  reset(dir)
  if (!process.env.KEEPCACHE) {
    tap.tearDown(function () {
      process.chdir(__dirname)
      rimraf.sync(cacheDir)
    })
    tap.afterEach(function (cb) {
      reset(dir)
      cb()
    })
  }
  return dir
}

module.exports.reset = reset
function reset (testDir) {
  process.chdir(__dirname)
  rimraf.sync(testDir)
  mkdirp.sync(testDir)
  process.chdir(testDir)
}
