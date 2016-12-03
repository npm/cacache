var fs = require('graceful-fs')

module.exports = move
function move (src, dest, cb) {
  fs.link(src, dest, function (err) {
    if (err) {
      if (err.code === 'EEXIST' || err.code === 'EBUSY') {
        // file already exists, so whatever
      } else if (err.code === 'EPERM' && process.platform === 'win32') {
        // file handle stayed open even past graceful-fs limits
      } else {
        return cb(err)
      }
    }
    fs.unlink(src, cb)
  })
}
