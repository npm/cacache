var fs = require('graceful-fs')
var path = require('path')
var pumpify = require('pumpify')
var tar = require('tar-fs')
var through = require('through2')
var zlib = require('zlib')

module.exports = extract
function extract (target, opts) {
  var stream = through()
  stream.on('data', function headerCheck (c) {
    pumpify(stream, makeOutStream(c, target, opts))
    // remove and re-emit
    stream.removeListener('data', headerCheck)
    stream.emit('data', c)
  })
  return stream
}

function makeOutStream (c, target, opts) {
  if (c[0] === 0x1F && c[1] === 0x8B && c[2] === 0x08) {
    return pumpify(zlib.Unzip(), makeTarStream(target, opts))
  } else if (hasTarHeader(c)) {
    return makeTarStream(target, opts)
  } else {
    return fs.createWriteStream(path.join(target, opts.filename || 'index.js'))
  }
}

function makeTarStream (target, opts) {
  return tar.extract(target, {
    map: function (header) {
      if (process.platform !== 'win32') {
        header.uid = typeof opts.uid === 'number' ? opts.uid : header.uid
        header.gid = typeof opts.gid === 'number' ? opts.gid : header.gid
      }
      return header
    },
    ignore: opts.ignore,
    dmode: opts.dmode,
    fmode: opts.fmode,
    umask: opts.umask,
    strip: opts.strip
  })
}

function hasTarHeader (c) {
  return c[257] === 0x75 && // tar archives have 7573746172 at position
         c[258] === 0x73 && // 257 and 003030 or 202000 at position 262
         c[259] === 0x74 &&
         c[260] === 0x61 &&
         c[261] === 0x72 &&

       ((c[262] === 0x00 &&
         c[263] === 0x30 &&
         c[264] === 0x30) ||

        (c[262] === 0x20 &&
         c[263] === 0x20 &&
         c[264] === 0x00))
}
