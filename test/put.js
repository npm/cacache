var fs = require('fs')
var path = require('path')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var cache = path.join(testDir, 'cache')
var get = require('../get')
// This test uses `put.stream` for most of its tests
// because it's the function the other writers call.
var put = require('../put')

test('basic file put', function (t) {
  var key = 'mydata'
  fs.writeFileSync('index.js', 'foobarbaz')
  var stream = fs.createReadStream('index.js')
  put.stream(cache, key, stream, function (err) {
    if (err) { throw err }
    get.info(cache, key, function (err, info) {
      if (err) { throw err }
      t.ok(info, 'info for inserted file found')
      t.equal(info.key, key, 'key in index matches inserted')

      var content = path.join(cache, info.path)
      t.ok(fs.statSync(content).isDirectory(), 'made a dir')

      var cachedFile = path.join(content, 'index.js')
      t.equal(
        fs.readFileSync(cachedFile, 'utf8'),
        'foobarbaz',
        'file contents are identical to inserted content'
      )

      t.end()
    })
  })
})
