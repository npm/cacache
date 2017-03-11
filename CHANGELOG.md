# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="6.0.2"></a>
## [6.0.2](https://github.com/zkat/cacache/compare/v6.0.1...v6.0.2) (2017-03-11)


### Bug Fixes

* **index:** segment cache items with another subbucket (#64) ([c3644e5](https://github.com/zkat/cacache/commit/c3644e5))



<a name="6.0.1"></a>
## [6.0.1](https://github.com/zkat/cacache/compare/v6.0.0...v6.0.1) (2017-03-05)


### Bug Fixes

* **docs:** Missed spots in README ([8ffb7fa](https://github.com/zkat/cacache/commit/8ffb7fa))



<a name="6.0.0"></a>
# [6.0.0](https://github.com/zkat/cacache/compare/v5.0.3...v6.0.0) (2017-03-05)


### Bug Fixes

* **api:** keep memo cache mostly-internal ([2f72d0a](https://github.com/zkat/cacache/commit/2f72d0a))
* **content:** use the rest of the string, not the whole string ([fa8f3c3](https://github.com/zkat/cacache/commit/fa8f3c3))
* **deps:** removed `format-number[@2](https://github.com/2).0.2` ([1187791](https://github.com/zkat/cacache/commit/1187791))
* **deps:** removed inflight[@1](https://github.com/1).0.6 ([0d1819c](https://github.com/zkat/cacache/commit/0d1819c))
* **deps:** rimraf[@2](https://github.com/2).6.1 ([9efab6b](https://github.com/zkat/cacache/commit/9efab6b))
* **deps:** standard[@9](https://github.com/9).0.0 ([4202cba](https://github.com/zkat/cacache/commit/4202cba))
* **deps:** tap[@10](https://github.com/10).3.0 ([aa03088](https://github.com/zkat/cacache/commit/aa03088))
* **deps:** weallcontribute[@1](https://github.com/1).0.8 ([ad4f4dc](https://github.com/zkat/cacache/commit/ad4f4dc))
* **docs:** add security note to hashKey ([03f81ba](https://github.com/zkat/cacache/commit/03f81ba))
* **hashes:** change default hashAlgorithm to sha512 ([ea00ba6](https://github.com/zkat/cacache/commit/ea00ba6))
* **hashes:** missed a spot for hashAlgorithm defaults ([45997d8](https://github.com/zkat/cacache/commit/45997d8))
* **index:** add length header before JSON for verification ([fb8cb4d](https://github.com/zkat/cacache/commit/fb8cb4d))
* **index:** change index filenames to sha1s of keys ([bbc5fca](https://github.com/zkat/cacache/commit/bbc5fca))
* **index:** who cares about race conditions anyway ([b1d3888](https://github.com/zkat/cacache/commit/b1d3888))
* **perf:** bulk-read get+read for massive speed ([d26cdf9](https://github.com/zkat/cacache/commit/d26cdf9))
* **perf:** use bulk file reads for index reads ([79a8891](https://github.com/zkat/cacache/commit/79a8891))
* **put-stream:** remove tmp file on stream insert error ([65f6632](https://github.com/zkat/cacache/commit/65f6632))
* **put-stream:** robustified and predictibilized ([daf9e08](https://github.com/zkat/cacache/commit/daf9e08))
* **put-stream:** use new promise API for moves ([1d36013](https://github.com/zkat/cacache/commit/1d36013))
* **readme:** updated to reflect new default hashAlgo ([c60a2fa](https://github.com/zkat/cacache/commit/c60a2fa))
* **verify:** tiny typo fix ([db22d05](https://github.com/zkat/cacache/commit/db22d05))


### Features

* **api:** converted external api ([7bf032f](https://github.com/zkat/cacache/commit/7bf032f))
* **cacache:** exported clearMemoized() utility ([8d2c5b6](https://github.com/zkat/cacache/commit/8d2c5b6))
* **cache:** add versioning to content and index ([31bc549](https://github.com/zkat/cacache/commit/31bc549))
* **content:** collate content files into subdirs ([c094d9f](https://github.com/zkat/cacache/commit/c094d9f))
* **deps:** [@npmcorp](https://github.com/npmcorp)/move[@1](https://github.com/1).0.0 ([bdd00bf](https://github.com/zkat/cacache/commit/bdd00bf))
* **deps:** bluebird[@3](https://github.com/3).4.7 ([3a17aff](https://github.com/zkat/cacache/commit/3a17aff))
* **deps:** promise-inflight[@1](https://github.com/1).0.1 ([a004fe6](https://github.com/zkat/cacache/commit/a004fe6))
* **get:** added memoization support for get ([c77d794](https://github.com/zkat/cacache/commit/c77d794))
* **get:** export hasContent ([2956ec3](https://github.com/zkat/cacache/commit/2956ec3))
* **index:** add hashAlgorithm and format insert ret val ([b639746](https://github.com/zkat/cacache/commit/b639746))
* **index:** collate index files into subdirs ([e8402a5](https://github.com/zkat/cacache/commit/e8402a5))
* **index:** promisify entry index ([cda3335](https://github.com/zkat/cacache/commit/cda3335))
* **memo:** added memoization lib ([da07b92](https://github.com/zkat/cacache/commit/da07b92))
* **memo:** export memoization api ([954b1b3](https://github.com/zkat/cacache/commit/954b1b3))
* **move-file:** add move fallback for weird errors ([5cf4616](https://github.com/zkat/cacache/commit/5cf4616))
* **perf:** bulk content write api ([51b536e](https://github.com/zkat/cacache/commit/51b536e))
* **put:** added memoization support to put ([b613a70](https://github.com/zkat/cacache/commit/b613a70))
* **read:** switched to promises ([a869362](https://github.com/zkat/cacache/commit/a869362))
* **rm:** added memoization support to rm ([4205cf0](https://github.com/zkat/cacache/commit/4205cf0))
* **rm:** switched to promises ([a000d24](https://github.com/zkat/cacache/commit/a000d24))
* **util:** promise-inflight ownership fix requests ([9517cd7](https://github.com/zkat/cacache/commit/9517cd7))
* **util:** use promises for api ([ae204bb](https://github.com/zkat/cacache/commit/ae204bb))
* **verify:** converted to Promises ([f0b3974](https://github.com/zkat/cacache/commit/f0b3974))


### BREAKING CHANGES

* cache: index/content directories are now versioned. Previous caches are no longer compatible and cannot be migrated.
* util: fix-owner now uses Promises instead of callbacks
* index: Previously-generated index entries are no longer compatible and the index must be regenerated.
* index: The index format has changed and previous caches are no longer compatible. Existing caches will need to be regenerated.
* hashes: Default hashAlgorithm changed from sha1 to sha512. If you
rely on the prior setting, pass `opts.hashAlgorithm` in explicitly.
* content: Previously-generated content directories are no longer compatible
and must be regenerated.
* verify: API is now promise-based
* read: Switches to a Promise-based API and removes callback stuff
* rm: Switches to a Promise-based API and removes callback stuff
* index: this changes the API to work off promises instead of callbacks
* api: this means we are going all in on promises now
