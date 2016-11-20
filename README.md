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

### Example

```javascript
import cacache from 'cacache'

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

### Guide

#### Introduction

### API

#### <a name="put-file"></a> `cacache.put.file`

##### Example

```javascript
cacache.put.file(cachePath, key, tarball, (err, digest) => {
  if (err) { throw err }
  console.log(`Saved ${tarball} to ${cachePath} as ${digest}.`)
})
```
