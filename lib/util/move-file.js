var fs = require('graceful-fs')

module.exports = moveFile
function moveFile (src, dest, cb) {
  // This isn't quite an fs.rename -- the assumption is that
  // if `dest` already exists, and we get certain errors while
  // trying to move it, we should just not bother.
  //
  // In the case of cache corruption, users will receive an
  // EBADCHECKSUM error elsewhere, and can remove the offending
  // content their own way.
  //
  // Note that, as the name suggests, this strictly only supports file moves.
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
