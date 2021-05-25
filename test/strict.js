'use strict'

const fs = require('fs')
const glob = require('glob')
const path = require('path')
const { test } = require('tap')

test('all JavaScript source files use strict mode', function (t) {
  const globStr = '**/*.js'
  const root = path.resolve(__dirname, '../')
  glob(
    globStr,
    {
      cwd: root,
      ignore: ['node_modules/**/*.js', 'coverage/**/*.js'],
    },
    function (err, files) {
      if (err)
        throw err

      const line = '\'use strict\'\n'
      const bytecount = line.length
      const buf = Buffer.alloc(bytecount)
      files.forEach(function (f) {
        const fd = fs.openSync(path.join(root, f), 'r')
        fs.readSync(fd, buf, 0, bytecount, 0)
        fs.closeSync(fd)
        t.equal(buf.toString('utf8'), line, f + ' is using strict mode.')
      })
      t.end()
    }
  )
})
