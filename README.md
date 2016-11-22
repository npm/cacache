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
  * [`ls`](#ls)
  * [`get.directory`](#get-directory)
  * [`get.tarball`](#get-tarball)
  * [`get.info`](#get-info)
  * [`put.file`](#put-file)
  * [`put.data`](#put-data)
  * [`put.stream`](#put-stream)
  * [`put.metadata`](#put-metadata)
  * [`put options`](#put-options)
  * [`rm.all`](#rm-all)
  * [`rm.entry`](#rm-entry)
  * [`rm.content`](#rm-content)
  * [`rm.gc`](#rm-gc)
  * [`chownr`](#chownr)

### Example

```javascript
const cacache = require('cacache')

const tarball = '/path/to/mytar.tgz'
const cachePath = '/tmp/my-toy-cache'
const key = 'my-unique-key-1234'
let tarballDigest = null

// Cache it! Use `cachePath` as the root of the content cache
cacache.put.file(cachePath, key, tarball, (err, digest) => {
  if (err) { return console.error('Error saving your file!', err.code) }
  tarballDigest = digest // we'll use this later
  console.log(`Saved ${tarball} to ${cachePath} as ${digest}.`)
})

const destination = '/tmp/mytar.tgz'

// Copy the contents out of the cache and into their destination!
cacache.get.file(cachePath, key, destination, (err) => {
  if (err) { return console.error('Error extracting data!', err.code) }
  console.log(`data extracted to ${cachePath}.`)
})

// The same thing, but skip the key index.
cacache.get.file.byDigest(cachePath, tarballDigest, destination, (err) => {
  if (err) { return console.error('Error extracting data!', err.code) }
  console.log(`data extracted to ${cachePath}.`)
})
```

### Features

* Extraction by key or by content digest (shasum, etc).
* Deduplicated content by digest -- two inputs with same key are only saved once
* Consistency checks, both on insert and extract.
* (Kinda) concurrency-safe and fault tolerant.
* Streaming support.
* Metadata storage.

### Guide

#### Introduction

### API

#### <a name="ls"></a> `> cacache.ls(cache, cb)`

Lists info for all entries currently in the cache as a single large object. Each
entry in the object will be keyed by the unique index key, with corresponding
[`get.info`](#get-info) objects as the values.

##### Example

```javascript
cacache.ls(cachePath, (err, allEntries) => {
  if (err) { throw err }
  console.log(info)
})
// Output
{
  'my-thing': {
    key: 'my-thing',
    digest: 'deadbeef',
    path: '.testcache/content/deadbeef',
    time: 12345698490,
    metadata: {
      name: 'blah',
      version: '1.2.3',
      description: 'this was once a package but now it is my-thing'
    }
  },
  'other-thing': {
    key: 'other-thing',
    digest: 'bada55',
    path: '.testcache/content/bada55',
    time: 11992309289
  }
}
```

#### <a name="get-file"></a> `> cacache.get.file(cache, key, destination, [opts], cb)`

Copies cached data identified by `key` to a file named `destination`.

If there is no content identified by `key`, or if the locally-stored data does
not pass the validity checksum, an error will be returned through the callback.

A sub-function, `get.file.byDigest` may be used for identical behavior,
except lookup will happen by content digest, bypassing the index entirely.

##### Example

```javascript
cacache.get.file(cachePath, 'my-thing', './put/it/here', (err) => {
  if (err) { throw err }
  console.log(`my-thing contents copied to ./put/it/here`)
})

cacache.get.file.byDigest(cachePath, pkg.sha, './put/it/here', (err) => {
  if (err) { throw err }
  console.log(`pkg contents copied to ./put/it/here`)
})
```

#### <a name="get-stream"></a> `> cacache.get.stream(cache, key, [opts], cb)`

Returns a stream of the cached data identified by `key`.

If there is no content identified by `key`, or if the locally-stored data does
not pass the validity checksum, an error will be emitted.

A sub-function, `get.stream.byDigest` may be used for identical behavior,
except lookup will happen by content digest, bypassing the index entirely.

##### Example

```javascript
cache.get.stream(
  cachePath, 'my-thing'
).pipe(
  fs.createWriteStream('./x.tgz')
)

cache.get.stream.byDigest(
  cachePath, 'deadbeef'
).pipe(
  fs.createWriteStream('./x.tgz')
)
```

#### <a name="get-info"></a> `> cacache.get.info(cache, key, cb)`

Looks up `key` in the cache index, returning information about the entry if
one exists. If an entry does not exist, the second argument to `cb` will be
falsy.

##### Fields

* `key` - Key the entry was looked up under. Matches the `key` argument.
* `digest` - Content digest the entry refers to.
* `path` - Filesystem path relative to `cache` argument where content is stored.
* `time` - Timestamp the entry was first added on.
* `metadata` - User-assigned metadata associated with the entry/content.

##### Example

```javascript
cacache.get.info(cachePath, 'my-thing', (err, info) => {
  if (err) { throw err }
  console.log(info)
})
// Output
{
  key: 'my-thing',
  digest: 'deadbeef',
  path: '.testcache/content/deadbeef',
  time: 12345698490,
  metadata: {
    name: 'blah',
    version: '1.2.3',
    description: 'this was once a package but now it is my-thing'
  }
}
```

#### <a name="put-file"></a> `> cacache.put.file(cache, key, file, [opts], cb)`

Inserts a file into the cache by pathname.

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

Inserts data from a stream into the cache.

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

If true, this insertion will overwrite the existing content in case of a race.
Note that in general, content digests are treated as absolute identifiers for
all content data, and verified both on insertion and extraction, so cacache
assumes it doesn't need to touch anything that was already written.

If false, will likely prevent race conditions where cache contents might already
be in the process of being read when the new cache content is renamed, causing
serious errors for running processes.

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

##### `uid`/`gid`

If provided, cacache will do its best to make sure any new files added to the
cache use this particular `uid`/`gid` combination. This can be used,
for example, to drop permissions when someone uses `sudo`, but cacache makes
no assumptions about your needs here.

##### `tmpPrefix`

Useful for debugging the cache -- prefix to use for randomly-named temporary
cache files.

#### <a name="rm-all"></a> `> cacache.rm.all(cache, cb)`

Clears the entire cache. Mainly by blowing away the cache directory itself.

##### Example

```javascript
cacache.rm.all(cachePath, (err) => {
  if (err) { throw err }
  console.log('THE APOCALYPSE IS UPON US 😱')
})
```

#### <a name="rm-entry"></a> `> cacache.rm.entry(cache, key, cb)`

Removes the index entry for `key`. Content will still be accessible if
requested directly.

##### Example

```javascript
cacache.rm.entry(cachePath, 'my-thing', (err) => {
  if (err) { throw err }
  console.log('I did not like it anyway')
})
```

#### <a name="rm-content"></a> `> cacache.rm.content(cache, digest, cb)`

Removes the content identified by `digest`. Any index entries referring to it
will not be usable again until the content is re-added to the cache with an
identical digest.

##### Example

```javascript
cacache.rm.content(cachePath, 'deadbeef', (err) => {
  if (err) { throw err }
  console.log('data for my-thing is gone!')
})
```

#### <a name="rm-gc"></a> `> cacache.rm.gc(cache, cb)`

Navigates the entry index, cleaning up inaccessible entries (due to appends),
and removes any content entries that are no longer reachable from index entries.

##### Example

```javascript
cacache.rm.gc(cachePath, (err) => {
  if (err) { throw err }
  console.log('less data in the cache now, and everything still works')
})
```

#### <a name="chownr"></a> `> cacache.chownr(cache, uid, gid, cb)`

Fixes ownership for the entire cache, including contents, such that it belongs
to a specific user.

##### Example

```javascript
cacache.chownr(cachePath, uid, gid, (err) => {
  if (err) { throw err }
  console.log('fewer permission issues now')
})
```
