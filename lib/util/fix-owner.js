'use strict'

const Promise = require('bluebird')

const chownr = Promise.promisify(require('chownr'))
const mkdirp = Promise.promisify(require('mkdirp'))
const inflight = require('promise-inflight')

module.exports.chownr = fixOwner
function fixOwner (filepath, uid, gid) {
  if (!process.getuid) {
    // This platform doesn't need ownership fixing
    return Promise.resolve()
  }
  if (typeof uid !== 'number' && typeof gid !== 'number') {
    // There's no permissions override. Nothing to do here.
    return Promise.resolve()
  }
  if ((typeof uid === 'number' && process.getuid() === uid) &&
      (typeof gid === 'number' && process.getgid() === gid)) {
    // No need to override if it's already what we used.
    return Promise.resolve()
  }
  return inflight(
    'fixOwner: fixing ownership on ' + filepath,
    () => chownr(
      filepath,
      typeof uid === 'number' ? uid : process.getuid(),
      typeof gid === 'number' ? gid : process.getgid()
    )
  )
}

module.exports.mkdirfix = mkdirfix
function mkdirfix (p, uid, gid, cb) {
  return mkdirp(p).then(made => {
    if (made) {
      return fixOwner(made, uid, gid).then(() => made)
    }
  })
}
