# cacache [![Travis](https://img.shields.io/travis/zkat/cacache.svg)](https://travis-ci.org/zkat/cacache) [![npm version](https://img.shields.io/npm/v/cacache.svg)](https://npm.im/cacache) [![license](https://img.shields.io/npm/l/cacache.svg)](https://npm.im/cacache)

[`cacache`](https://github.com/zkat/cacache) is a Node.js library for managing
caches of keyed data that can be looked up both by key and by a digest of the
content itself. This means that by-content lookups can be very very fast, and
that stored content is shared by different keys if they point to the same data.

## Install

`$ npm install cacache`

## Table of Contents

* [Example](#example)
* [Features](#features)
* [Guide](#guide)
  * [Introduction](#introduction)
  * [Putting Data In](#insertion)
  * [Getting Data Out](#extraction)
  * [Querying the Cache](#queries)
  * [Cleaning Up](#cleanup)
* [API](#api)
  * [`put.file`](#put-file)
  * [`put.data`](#put-data)
  * [`put.stream`](#put-stream)
  * [`put.metadata`](#put-metadata)
  * [`put options`](#put-options)

### Example

```javascript
const cacache = require('cacache')

const tarball = '/path/to/mytar.tgz'
const cachePath = '/tmp/my-toy-cache'
const key = 'my-unique-key-1234'

// Cache it! Use `cachePath` as the root of the content cache
cacache.put.file(cachePath, key, tarball, (err, digest) => {
  if (err) { return console.error('Error saving your file!', err.code) }
  console.log(`Saved ${tarball} to ${cachePath} as ${digest}.`)
})

const destination = '/tmp/extract-to-here'

// Copy the contents out of the cache and into their destination!
cacache.get.copy(cachePath, key, destination, (err) => {
  if (err) { return console.error('Error extracting data!', err.code) }
  console.log(`data extracted to ${cachePath}.`)
})
```

### Features

* Stores tarball data (expanded) or single files
* Extraction by key or by content digest (shasum, etc).
* Deduplicated content by digest -- two inputs with same key are only saved once
* Manipulate tarball data on expansion and save the updated version
* Data validation
* Streaming support
* Metadata storage

### Guide

#### Introduction

### API

#### <a name="put-file"></a> `> cacache.put.file(cache, key, file, [opts], cb)`

Inserts a file into the cache by pathname. If `file` refers to a tarball, it
will be expanded and stored in the cache that way. The tarball may optionally
be gzipped. Any other files will be stored as single files inside the cache
directory.

##### Example

```javascript
cacache.put.file(cachePath, 'my-dotfiles', './tarball.tgz', (err, digest) => {
  if (err) { throw err }
  console.log(`Saved as ${digest}.`)
})
```

#### <a name="put-data"></a> `> cacache.put.data(cache, key, filename, data, [opts], cb)`

Inserts plain string data into the cache, using `filename` for the cache file.

##### Example

```javascript
cacache.put.data(cachePath, key, filename, 'wompwomp', (err, digest) => {
  if (err) { throw err }
  console.log(`Wrote 'wompwomp' into cache. It will be in ${filename}`)
})
```

#### <a name="put-stream"></a> `> cacache.put.stream(cache, key, stream, [opts], cb)`

Inserts data from a stream into the cache. If the stream contains tarball data,
it will be expanded and stored in the cache that way. The tar data may
optionally be gzipped. Any other data type will be stored as single files inside
the cache directory.

##### Example

```javascript
var req = request.get('https://registry.npmjs.org/cacache/-/cacache-1.0.0.tgz')
cacache.put.stream(cachePath, 'registry.npmjs.org|cacache@1.0.0', req, (err, digest) => {
  if (err) { throw err }
  console.log(`Package tarball written to cache. sha: ${digest}`)
})
```

#### <a name="put-metadata"></a> `> cacache.put.metadata(cache, key, metadata, [opts], cb)`

Adds or updates metadata for a previously inserted entry. To add metadata on
initial insertion, use `opts.metadata` in the other `cacache.put` functions.

##### Example

```javascript
cacache.put.metadata(cachePath, 'registry.npmjs.org|cacache@1.0.0', {
  name: 'cacache', version: '1.0.0'
}, (err, digest) => {
  if (err) { throw err }
  console.log(`Package tarball written to cache. sha: ${digest}`)
})
```
#### <a name="put-options"></a> `> cacache.put options`

`cacache.put` functions have a number of options in common.

##### `metadata`

Arbitrary metadata to be attached to the inserted key.

##### `clobber`

Default: false

If true, this insertion will overwrite the existing content directory in case
of a race. Note that in general, content digests are treated as absolute
identifiers for all content data, so cacache assumes it doesn't need to touch
anything that was already written.

If false, will likely prevent race conditions where cache contents might already
be in the process of being read when the new cache content is renamed, causing
serious errors for running processes.

##### `filename`

When inserting non-tarball data, the filename to use for the sole file to be
stored.

##### `digest`

If present, the pre-calculated digest for the inserted content. If this option
if provided and does not match the post-insertion digest, insertion will fail.

To control the hashing algorithm, use `opts.hash`.

##### `hash`

Default: 'sha256'

Hashing algorithm to use when calculating the digest for inserted data. Can use
any algorithm supported by Node.js' `crypto` module.

##### `logger`

Will be called with a loglevel as its first argument on any internal log events.

##### `strip`

Default: 0

When inserting tarballs, the number of directories to strip from the beginning
of the contents' paths.

##### `dmode`/`fmode`/`umask`

Modes applied to expanded content files. Does not affect the rest of the cache.

##### `uid`/`gid`

uid and gid for any new content added to the cache.

##### `ignore`

Function that receives the filename and header information for expanded tarball
files. If it returns true, the file will be skipped during expansion.

```javascript
ignore: (name, header) => {
  return name.startsWith('.')
}
```

##### `verifier`

Receives the internal path to the expanded cache contents. Can be used to verify
and arbitrarily modify the data to be stored.

If the callback receives an error, content insertion will fail and the content
will be deleted.

```javascript
verifier: (path, digest, cb) => {
  fs.lstat(path + '/.sekrit', (err) => {
    if (err) {
      cb()
    } else {
      cb(new Error('sekrit file should not be there!'))
    }
  })
}
```

##### `tmpPrefix`

Useful for debugging the cache -- prefix to use for randomly-named temporary
cache directories.
