var crypto = require('crypto')
var fromString = require('./util/from-string')
var fs = require('fs')
var path = require('path')
var pipe = require('mississippi').pipe
var Tacks = require('tacks')
var test = require('tap').test
var testDir = require('./util/test-dir')(__filename)

var CACHE = path.join(testDir, 'cache')
var contentPath = require('../lib/content/path')
var Dir = Tacks.Dir
var File = Tacks.File
var putStream = require('../lib/content/put-stream')

test('basic put', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha1').update(CONTENT).digest('hex')
  var foundDigest
  var src = fromString(CONTENT)
  var stream = putStream(CACHE).on('digest', function (d) {
    foundDigest = d
  })
  pipe(src, stream, function (err) {
    if (err) { throw err }
    var cpath = contentPath(CACHE, foundDigest)
    t.plan(3)
    t.equal(foundDigest, DIGEST, 'returned digest matches expected')
    fs.stat(cpath, function (err, stat) {
      if (err) { throw err }
      t.ok(stat.isFile(), 'content inserted as a single file')
    })
    fs.readFile(cpath, 'utf8', function (err, data) {
      if (err) { throw err }
      t.equal(data, CONTENT, 'contents are identical to inserted content')
    })
  })
})

test('checks input digest doesn\'t match data', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha1').update(CONTENT).digest('hex')
  t.plan(5)
  var foundDigest1
  var foundDigest2
  pipe(fromString('bazbarfoo'), putStream(CACHE, {
    digest: DIGEST
  }).on('digest', function (d) {
    foundDigest1 = d
  }), function (err) {
    t.ok(!foundDigest1, 'no digest emitted')
    t.ok(!!err, 'got an error')
    t.equal(err.code, 'EBADCHECKSUM', 'returns a useful error code')
  })
  pipe(fromString(CONTENT), putStream(CACHE, {
    digest: DIGEST
  }).on('digest', function (d) {
    foundDigest2 = d
  }), function (err) {
    t.ok(!err, 'completed without error')
    t.equal(foundDigest2, DIGEST, 'returns a matching digest')
  })
})

test('errors if stream ends with no data', function (t) {
  var foundDigest
  pipe(fromString(''), putStream(CACHE).on('digest', function (d) {
    foundDigest = d
  }), function (err) {
    t.ok(err, 'got an error')
    t.ok(!foundDigest, 'no digest returned')
    t.equal(err.code, 'ENODATA', 'returns useful error code')
    t.end()
  })
})

test('errors if input stream errors', function (t) {
  var stream = fromString('foo').on('data', function (d) {
    stream.emit('error', new Error('bleh'))
  })
  var foundDigest
  pipe(stream, putStream(CACHE).on('digest', function (d) {
    foundDigest = d
  }), function (err) {
    t.ok(err, 'got an error')
    t.ok(!foundDigest, 'no digest returned')
    t.match(err.message, 'bleh', 'returns the error from input stream')
    t.end()
  })
})

test('does not overwrite content if already on disk', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha1').update(CONTENT).digest('hex')
  var contentDir = {}
  contentDir[DIGEST] = File('nope')
  var fixture = new Tacks(Dir({
    'content': Dir(contentDir)
  }))
  fixture.create(CACHE)
  t.plan(4)
  var dig1
  var dig2
  // With a digest -- early short-circuiting
  pipe(fromString(CONTENT), putStream(CACHE, {
    digest: DIGEST
  }).on('digest', function (d) {
    dig1 = d
  }), function (err) {
    if (err) { throw err }
    t.equal(dig1, DIGEST, 'short-circuit returns a matching digest')
    fs.readFile(path.join(CACHE, 'content', DIGEST), 'utf8', function (e, d) {
      if (e) { throw e }
      t.equal(d, 'nope', 'process short-circuited. Data not written.')
    })
  })
  pipe(fromString(CONTENT), putStream(CACHE).on('digest', function (d) {
    dig2 = d
  }), function (err) {
    if (err) { throw err }
    t.equal(dig2, DIGEST, 'full write returns a matching digest')
    fs.readFile(path.join(CACHE, 'content', DIGEST), 'utf8', function (e, d) {
      if (e) { throw e }
      t.equal(d, 'nope', 'previously-written data intact - no dupe write')
    })
  })
})

test('exits normally if file already open', function (t) {
  var CONTENT = 'foobarbaz'
  var DIGEST = crypto.createHash('sha1').update(CONTENT).digest('hex')
  var PATH = path.join(CACHE, 'content', DIGEST)
  var contentDir = {}
  contentDir[DIGEST] = File(CONTENT)
  var fixture = new Tacks(Dir({
    'content': Dir(contentDir)
  }))
  var foundDigest
  fixture.create(CACHE)
  // This case would only fail on Windows, when an entry is being read.
  // Generally, you'd get an EBUSY back.
  fs.open(PATH, 'r+', function (err, fd) {
    if (err) { throw err }
    pipe(fromString(CONTENT), putStream(CACHE).on('digest', function (d) {
      foundDigest = d
    }), function (err) {
      if (err) { throw err }
      t.equal(foundDigest, DIGEST, 'returns a matching digest')
      fs.close(fd, function (err) {
        if (err) { throw err }
        t.end()
      })
    })
  })
})

test('cleans up tmp on successful completion', {
  // TODO: There's an issue with rimraf on Windows where it's failing to clean
  // things up. Skip this for now and deal with it later. :(
  skip: process.platform === 'win32'
}, function (t) {
  var CONTENT = 'foobarbaz'
  pipe(fromString(CONTENT), putStream(CACHE), function (err) {
    if (err) { throw err }
    var tmp = path.join(CACHE, 'tmp')
    fs.readdir(tmp, function (err, files) {
      if (!err || (err && err.code === 'ENOENT')) {
        files = files || []
        t.deepEqual(files, [], 'nothing in the tmp dir!')
        t.end()
      } else {
        throw err
      }
    })
  })
})

test('cleans up tmp on error')

test('checks the size of stream data if opts.size provided', function (t) {
  var CONTENT = 'foobarbaz'
  var dig1, dig2, dig3
  t.plan(8)
  pipe(
    fromString(CONTENT.slice(3)),
    putStream(CACHE, {
      size: CONTENT.length
    }).on('digest', function (d) { dig1 = d }),
    function (err) {
      t.ok(!!err, 'got an error')
      t.ok(!dig1, 'no digest returned')
      t.equal(err.code, 'EBADSIZE', 'returns a useful error code')
    }
  )
  pipe(
    fromString(CONTENT + 'quux'),
    putStream(CACHE, {
      size: CONTENT.length
    }).on('digest', function (d) { dig2 = d }),
    function (err) {
      t.ok(!!err, 'got an error')
      t.ok(!dig2, 'no digest returned')
      t.equal(err.code, 'EBADSIZE', 'returns a useful error code')
    }
  )
  pipe(
    fromString(CONTENT),
    putStream(CACHE, {
      size: CONTENT.length
    }).on('digest', function (d) { dig3 = d }),
    function (err) {
      t.ifError(err, 'completed without error')
      t.ok(dig3, 'got a digest')
    }
  )
})
