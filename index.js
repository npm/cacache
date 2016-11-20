module.exports = {
  chownr: require('./lib/util/fix-owner').chownr,
  ls: require('./ls'),
  get: require('./get'),
  put: require('./put'),
  rm: require('./rm')
}
