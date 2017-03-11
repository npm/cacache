# cacache [![npm version](https://img.shields.io/npm/v/cacache.svg)](https://npm.im/cacache) [![license](https://img.shields.io/npm/l/cacache.svg)](https://npm.im/cacache) [![Travis](https://img.shields.io/travis/zkat/cacache.svg)](https://travis-ci.org/zkat/cacache) [![AppVeyor](https://ci.appveyor.com/api/projects/status/github/zkat/cacache?svg=true)](https://ci.appveyor.com/project/zkat/cacache) [![Coverage Status](https://coveralls.io/repos/github/zkat/cacache/badge.svg?branch=latest)](https://coveralls.io/github/zkat/cacache?branch=latest)

[`cacache`](https://github.com/zkat/cacache) is a Node.js library for managing
local key and content address caches. It's really fast, really good at
concurrency, and it will never give you corrupted data, even if cache files
get corrupted or manipulated.

It was originally written to be used as [npm](https://npm.im)'s local cache, but
can just as easily be used on its own

## Install

`$ npm install --save cacache`

## Table of Contents

* [Example](#example)
* [Features](#features)
* [Contributing](#contributing)
* [API](#api)
  * Reading
    * [`ls`](#ls)
    * [`ls.stream`](#ls-stream)
    * [`get`](#get-data)
    * [`get.stream`](#get-stream)
    * [`get.info`](#get-info)
  * Writing
    * [`put`](#put-data)
    * [`put.stream`](#put-stream)
    * [`put*` opts](#put-options)
    * [`rm.all`](#rm-all)
    * [`rm.entry`](#rm-entry)
    * [`rm.content`](#rm-content)
  * Utilities
    * [`clearMemoized`](#clear-memoized)
    * [`verify`](#verify)
    * [`verify.lastRun`](#verify-last-run)

### Example

```javascript
const cacache = require('cacache')
const fs = require('fs')

const tarball = '/path/to/mytar.tgz'
const cachePath = '/tmp/my-toy-cache'
const key = 'my-unique-key-1234'

// Cache it! Use `cachePath` as the root of the content cache
cacache.put(cachePath, key, '10293801983029384').then(digest => {
  console.log(`Saved content to ${cachePath}.`)
})

const destination = '/tmp/mytar.tgz'

// Copy the contents out of the cache and into their destination!
// But this time, use stream instead!
cacache.get.stream(
  cachePath, key
).pipe(
  fs.createWriteStream(destination)
).on('finish', () => {
  console.log('done extracting!')
})

// The same thing, but skip the key index.
cacache.get.byDigest(cachePath, tarballSha512).then(data => {
  fs.writeFile(destination, data, err => {
    console.log('tarball data fetched based on its sha512sum and written out!')
  })
})
```

### Features

* Extraction by key or by content address (shasum, etc)
* Multi-hash support - safely host sha1, sha512, etc, in a single cache
* Automatic content deduplication
* Fault tolerance and consistency guarantees for both insertion and extraction
* Lockless, high-concurrency cache access
* Streaming support
* Promise support
* Arbitrary metadata storage
* Garbage collection and additional offline verification

### Contributing

The cacache team enthusiastically welcomes contributions and project participation! There's a bunch of things you can do if you want to contribute! The [Contributor Guide](CONTRIBUTING.md) has all the information you need for everything from reporting bugs to contributing entire new features. Please don't hesitate to jump in if you'd like to, or even ask us questions if something isn't clear.

### API

#### <a name="ls"></a> `> cacache.ls(cache) -> Promise`

Lists info for all entries currently in the cache as a single large object. Each
entry in the object will be keyed by the unique index key, with corresponding
[`get.info`](#get-info) objects as the values.

##### Example

```javascript
cacache.ls(cachePath).then(console.log)
// Output
{
  'my-thing': {
    key: 'my-thing',
    digest: 'deadbeef',
    hashAlgorithm: 'sha512',
    path: '.testcache/content/deadbeef', // joined with `cachePath`
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
    hashAlgorithm: 'whirlpool',
    path: '.testcache/content/bada55',
    time: 11992309289
  }
}
```

#### <a name="ls-stream"></a> `> cacache.ls.stream(cache) -> Readable`

Lists info for all entries currently in the cache as a single large object.

This works just like [`ls`](#ls), except [`get.info`](#get-info) entries are
returned as `'data'` events on the returned stream.

##### Example

```javascript
cacache.ls.stream(cachePath).on('data', console.log)
// Output
{
  key: 'my-thing',
  digest: 'deadbeef',
  hashAlgorithm: 'sha512',
  path: '.testcache/content/deadbeef', // joined with `cachePath`
  time: 12345698490,
  metadata: {
    name: 'blah',
    version: '1.2.3',
    description: 'this was once a package but now it is my-thing'
  }
}

{
  key: 'other-thing',
  digest: 'bada55',
  hashAlgorithm: 'whirlpool',
  path: '.testcache/content/bada55',
  time: 11992309289
}

{
  ...
}
```

#### <a name="get-data"></a> `> cacache.get(cache, key, [opts]) -> Promise({data, metadata, digest, hashAlgorithm})`

Returns an object with the cached data, digest, and metadata identified by
`key`. The `data` property of this object will be a `Buffer` instance that
presumably holds some data that means something to you. I'm sure you know what
to do with it! cacache just won't care. `hashAlgorithm` is the algorithm used
to calculate the `digest` of the content. This algorithm must be used if you
fetch later with `get.byDigest`.

If there is no content identified by `key`, or if the locally-stored data does
not pass the validity checksum, the promise will be rejected.

A sub-function, `get.byDigest` may be used for identical behavior, except lookup
will happen by content digest, bypassing the index entirely. This version of the
function *only* returns `data` itself, without any wrapper.

##### Note

This function loads the entire cache entry into memory before returning it. If
you're dealing with Very Large data, consider using [`get.stream`](#get-stream)
instead.

##### Example

```javascript
// Look up by key
cache.get(cachePath, 'my-thing').then(console.log)
// Output:
{
  metadata: {
    thingName: 'my'
  },
  digest: 'deadbeef',
  hashAlgorithm: 'sha512'
  data: Buffer#<deadbeef>
}

// Look up by digest
cache.get.byDigest(cachePath, 'deadbeef', {
  hashAlgorithm: 'sha512'
}).then(console.log)
// Output:
Buffer#<deadbeef>
```

#### <a name="get-stream"></a> `> cacache.get.stream(cache, key, [opts]) -> Readable`

Returns a [Readable Stream](https://nodejs.org/api/stream.html#stream_readable_streams) of the cached data identified by `key`.

If there is no content identified by `key`, or if the locally-stored data does
not pass the validity checksum, an error will be emitted.

`metadata` and `digest` events will be emitted before the stream closes, if
you need to collect that extra data about the cached entry.

A sub-function, `get.stream.byDigest` may be used for identical behavior,
except lookup will happen by content digest, bypassing the index entirely. This
version does not emit the `metadata` and `digest` events at all.

##### Example

```javascript
// Look up by key
cache.get.stream(
  cachePath, 'my-thing'
).on('metadata', metadata => {
  console.log('metadata:', metadata)
}).on('hashAlgorithm', algo => {
  console.log('hashAlgorithm:', algo)
}).on('digest', digest => {
  console.log('digest:', digest)
}).pipe(
  fs.createWriteStream('./x.tgz')
)
// Outputs:
metadata: { ... }
hashAlgorithm: 'sha512'
digest: deadbeef

// Look up by digest
cache.get.stream.byDigest(
  cachePath, 'deadbeef', { hashAlgorithm: 'sha512' }
).pipe(
  fs.createWriteStream('./x.tgz')
)
```

#### <a name="get-info"></a> `> cacache.get.info(cache, key) -> Promise`

Looks up `key` in the cache index, returning information about the entry if
one exists.

##### Fields

* `key` - Key the entry was looked up under. Matches the `key` argument.
* `digest` - Content digest the entry refers to.
* `hashAlgorithm` - Hashing algorithm used to generate `digest`.
* `path` - Filesystem path relative to `cache` argument where content is stored.
* `time` - Timestamp the entry was first added on.
* `metadata` - User-assigned metadata associated with the entry/content.

##### Example

```javascript
cacache.get.info(cachePath, 'my-thing').then(console.log)

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

#### <a name="put-data"></a> `> cacache.put(cache, key, data, [opts]) -> Promise`

Inserts data passed to it into the cache. The returned Promise resolves with a
digest (generated according to [`opts.hashAlgorithm`](#hashalgorithm)) after the
cache entry has been successfully written.

##### Example

```javascript
fetch(
  'https://registry.npmjs.org/cacache/-/cacache-1.0.0.tgz'
).then(data => {
  return cacache.put(cachePath, 'registry.npmjs.org|cacache@1.0.0', data)
}).then(digest => {
  console.log('digest is', digest)
})
```

#### <a name="put-stream"></a> `> cacache.put.stream(cache, key, [opts]) -> Writable`

Returns a [Writable
Stream](https://nodejs.org/api/stream.html#stream_writable_streams) that inserts
data written to it into the cache. Emits a `digest` event with the digest of
written contents when it succeeds.

##### Example

```javascript
request.get(
  'https://registry.npmjs.org/cacache/-/cacache-1.0.0.tgz'
).pipe(
  cacache.put.stream(
    cachePath, 'registry.npmjs.org|cacache@1.0.0'
  ).on('digest', d => console.log('digest is ${d}'))
)
```

#### <a name="put-options"></a> `> cacache.put options`

`cacache.put` functions have a number of options in common.

##### `metadata`

Arbitrary metadata to be attached to the inserted key.

##### `size`

If provided, the data stream will be verified to check that enough data was
passed through. If there's more or less data than expected, insertion will fail
with an `EBADSIZE` error.

##### `digest`

If present, the pre-calculated digest for the inserted content. If this option
if provided and does not match the post-insertion digest, insertion will fail
with an `EBADCHECKSUM` error.

To control the hashing algorithm, use `opts.hashAlgorithm`.

##### `hashAlgorithm`

Default: 'sha512'

Hashing algorithm to use when calculating the digest for inserted data. Can use
any algorithm listed in `crypto.getHashes()` or `'omakase'`/`'お任せします'` to
pick a random hash algorithm on each insertion. You may also use any anagram of
`'modnar'` to use this feature.

##### `uid`/`gid`

If provided, cacache will do its best to make sure any new files added to the
cache use this particular `uid`/`gid` combination. This can be used,
for example, to drop permissions when someone uses `sudo`, but cacache makes
no assumptions about your needs here.

##### `memoize`

Default: null

If provided, cacache will memoize the given cache insertion in memory, bypassing
any filesystem checks for that key or digest in future cache fetches. Nothing
will be written to the in-memory cache unless this option is explicitly truthy.

There is no facility for limiting memory usage short of
[`cacache.clearMemoized()`](#clear-memoized), so be mindful of the sort of data
you ask to get memoized!

Reading from existing memoized data can be forced by explicitly passing
`memoize: false` to the reader functions, but their default will be to read from
memory.

#### <a name="rm-all"></a> `> cacache.rm.all(cache) -> Promise`

Clears the entire cache. Mainly by blowing away the cache directory itself.

##### Example

```javascript
cacache.rm.all(cachePath).then(() => {
  console.log('THE APOCALYPSE IS UPON US 😱')
})
```

#### <a name="rm-entry"></a> `> cacache.rm.entry(cache, key) -> Promise`

Alias: `cacache.rm`

Removes the index entry for `key`. Content will still be accessible if
requested directly by content address ([`get.stream.byDigest`](#get-stream)).

##### Example

```javascript
cacache.rm.entry(cachePath, 'my-thing').then(() => {
  console.log('I did not like it anyway')
})
```

#### <a name="rm-content"></a> `> cacache.rm.content(cache, digest) -> Promise`

Removes the content identified by `digest`. Any index entries referring to it
will not be usable again until the content is re-added to the cache with an
identical digest.

##### Example

```javascript
cacache.rm.content(cachePath, 'deadbeef').then(() => {
  console.log('data for my-thing is gone!')
})
```

#### <a name="clear-memoized"></a> `> cacache.clearMemoized()`

Completely resets the in-memory entry cache.

#### <a name="verify"></a> `> cacache.verify(cache, opts) -> Promise`

Checks out and fixes up your cache:

* Cleans up corrupted or invalid index entries.
* Garbage collects any content entries not referenced by the index.
* Checks digests for all content entries and removes invalid content.
* Fixes cache ownership.
* Removes the `tmp` directory in the cache and all its contents.

When it's done, it'll return an object with various stats about the verification
process, including amount of storage reclaimed, number of valid entries, number
of entries removed, etc.

This function should not be run while other processes are running `cacache`. It
assumes it'll be used offline by a human or a coordinated process. Concurrent
verifies are protected by a lock, but there's no guarantee others won't be
reading/writing on the cache.

##### Options

* `opts.uid` - uid to assign to cache and its contents
* `opts.gid` - gid to assign to cache and its contents
* `opts.hashAlgorithm` - defaults to `'sha512'`. Hash to use for content checks.


##### Example

```sh
echo somegarbage >> $CACHEPATH/content/deadbeef
```

```javascript
cacache.verify(cachePath).then(stats => {
  // deadbeef collected, because of invalid checksum.
  console.log('cache is much nicer now! stats:', stats)
})
```

#### <a name="verify-last-run"></a> `> cacache.verify.lastRun(cache) -> Promise`

Returns a `Date` representing the last time `cacache.verify` was run on `cache`.

##### Example

```javascript
cacache.verify(cachePath).then(() => {
  cacache.verify.lastRun(cachePath).then(lastTime => {
    console.log('cacache.verify was last called on' + lastTime)
  })
})
```
