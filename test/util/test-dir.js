var mkdirp = require('mkdirp')
var path = require('path')
var rimraf = require('rimraf')
var tap = require('tap')

var cacheDir = path.resolve(__dirname, '../cache')

module.exports = testDir
function testDir (filename) {
  var dir = path.join(cacheDir, path.basename(filename, '.js'))
  mkdirp.sync(dir)
  process.chdir(dir)
  if (!process.env.KEEPCACHE) {
    tap.tearDown(function () {
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
  rimraf.sync(testDir + '/*')
}
