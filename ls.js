var index = require('./lib/entry-index')

module.exports.ls = index.ls
module.exports.ls.stream = index.lsStream
