var contentPath = require('./lib/content/path')
var index = require('./lib/entry-index')
var path = require('path')

module.exports = ls
function ls (cache, cb) {
  index.ls(cache, function (err, info) {
    if (err) { return cb(err) }
    var ret = {}
    var prefix = cache
    if (prefix.indexOf(process.env.HOME) === 0) {
      prefix = '~' + prefix.slice(process.env.HOME.length)
    }
    for (var k in info) {
      ret[k] = {
        key: k,
        path: path.join(prefix, path.relative(
          cache,
          contentPath(cache, info[k].digest)
        )),
        time: info[k].time
      }
      info[k].metadata && (ret[k].metadata = info[k].metadata)
    }
    cb(null, ret)
  })
}
