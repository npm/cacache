var chownr = require('chownr')
var dezalgo = require('dezalgo')
var inflight = require('inflight')
var mkdirp = require('mkdirp')

module.exports.chownr = fixOwner
function fixOwner (filepath, uid, gid, cb) {
  cb = dezalgo(cb)
  if (!process.getuid) {
    // This platform doesn't need ownership fixing
    return cb()
  }
  if (typeof uid !== 'number' && typeof gid !== 'number') {
    // There's no permissions override. Nothing to do here.
    return cb()
  }
  if ((typeof uid === 'number' && process.getuid() === uid) &&
      (typeof gid === 'number' && process.getgid() === gid)) {
    // No need to override if it's already what we used.
    return cb()
  }
  cb = inflight('fixOwner: fixing ownership on ' + filepath)
  if (!cb) {
    // We're inflight! whoosh!
    return
  }

  // *now* we override perms
  chownr(filepath, uid, gid, cb)
}

module.exports.mkdirfix = mkdirfix
function mkdirfix (p, uid, gid, cb) {
  mkdirp(p, function (err, made) {
    if (err || !made) { return cb(err, made) }
    fixOwner(p, uid, gid, cb)
  })
}
