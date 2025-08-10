'use strict'

const { glob } = require('tinyglobby')
const path = require('path')

const globify = (pattern) => pattern.split(path.win32.sep).join(path.posix.sep)
module.exports = (path, options) => glob(globify(path), options)
