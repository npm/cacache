'use strict'

const util = require('util')

const fs = require('fs')
const index = require('../lib/entry-index')
const memo = require('../lib/memoization')
const path = require('path')
const rimraf = util.promisify(require('rimraf'))
const Tacks = require('tacks')
const { test } = require('tap')
const testDir = require('./util/test-dir')(__filename)
const ssri = require('ssri')

const readFile = util.promisify(fs.readFile)

const CacheContent = require('./util/cache-content')

const CACHE = path.join(testDir, 'cache')
const CONTENT = Buffer.from('foobarbaz', 'utf8')
const SIZE = CONTENT.length
const KEY = 'my-test-key'
const INTEGRITY = ssri.fromData(CONTENT).toString()
const METADATA = { foo: 'bar' }

const { get } = require('..')

function opts (extra) {
  return Object.assign(
    {
      size: SIZE,
      metadata: METADATA
    },
    extra
  )
}

// Simple wrapper util cause this gets WORDY
function streamGet (byDigest) {
  const args = [].slice.call(arguments, 1)
  let integrity
  let metadata
  let size
  const stream = (byDigest ? get.stream.byDigest : get.stream).apply(null, args)
  return stream
    .on('integrity', (int) => {
      integrity = ssri.stringify(int)
    })
    .on('metadata', (m) => {
      metadata = m
    })
    .on('size', (s) => {
      size = s
    })
    .concat()
    .then((data) => ({
      data,
      integrity,
      metadata,
      size
    }))
}

test('get.info index entry lookup', (t) => {
  return index.insert(CACHE, KEY, INTEGRITY, opts()).then((ENTRY) => {
    return get.info(CACHE, KEY).then((entry) => {
      t.deepEqual(entry, ENTRY, 'get.info() returned the right entry')
    })
  })
})

test('get.sync will throw ENOENT if not found', (t) => {
  try {
    get.sync('foo', 'bar')
  } catch (err) {
    t.same(err.message, 'No cache entry for bar found in foo')
    t.same(err.code, 'ENOENT')
    t.done()
  }
})

test('get will throw ENOENT if not found', (t) => {
  return get(CACHE, KEY)
    .then(() => {
      throw new Error('lookup should fail')
    })
    .catch((err) => {
      t.ok(err, 'got an error')
      t.equal(err.code, 'ENOENT', 'error code is ENOENT')
      return get.info(CACHE, KEY)
    })
    .catch((err) => {
      t.ok(err, 'got an error')
      t.equal(err.code, 'ENOENT', 'error code is ENOENT')
    })
})

test('basic bulk get', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index
    .insert(CACHE, KEY, INTEGRITY, opts())
    .then(() => {
      return get(CACHE, KEY)
    })
    .then((res) => {
      t.deepEqual(
        res,
        {
          metadata: METADATA,
          data: CONTENT,
          integrity: INTEGRITY,
          size: SIZE
        },
        'bulk key get returned proper data'
      )
    })
    .then(() => {
      return get.byDigest(CACHE, INTEGRITY)
    })
    .then((res) => {
      t.deepEqual(res, CONTENT, 'byDigest returned proper data')
    })
})

test('get.sync.byDigest without memoization', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  index.insert.sync(CACHE, KEY, INTEGRITY, opts())
  const res = get.sync(CACHE, KEY)
  t.deepEqual(
    res,
    {
      metadata: METADATA,
      data: CONTENT,
      integrity: INTEGRITY,
      size: SIZE
    },
    'bulk key get returned proper data'
  )
  const resByDig = get.sync.byDigest(CACHE, INTEGRITY)
  t.deepEqual(resByDig, CONTENT, 'byDigest returned proper data')
  t.done()
})

test('get.sync.byDigest with memoization', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  index.insert.sync(CACHE, KEY, INTEGRITY, opts())
  const res = get.sync(CACHE, KEY, { memoize: true })
  t.deepEqual(
    res,
    {
      metadata: METADATA,
      data: CONTENT,
      integrity: INTEGRITY,
      size: SIZE
    },
    'bulk key get returned proper data'
  )
  memo.clearMemoized()
  t.same(memo.get.byDigest(CACHE, INTEGRITY), undefined)
  const resByDig = get.sync.byDigest(CACHE, INTEGRITY, { memoize: true })
  t.deepEqual(resByDig, CONTENT, 'byDigest returned proper data')
  t.notSame(memo.get.byDigest(CACHE, INTEGRITY), undefined)
  const resByDig2 = get.sync.byDigest(CACHE, INTEGRITY, { memoize: true })
  t.deepEqual(resByDig2, CONTENT, 'byDigest returned proper data')
  t.done()
})

test('get.sync with memoization', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  index.insert.sync(CACHE, KEY, INTEGRITY, opts())
  memo.clearMemoized()
  t.same(memo.get(CACHE, KEY), undefined)
  const res = get.sync(CACHE, KEY, { memoize: true })
  t.deepEqual(
    res,
    {
      metadata: METADATA,
      data: CONTENT,
      integrity: INTEGRITY,
      size: SIZE
    },
    'bulk key get returned proper data'
  )
  t.notSame(memo.get(CACHE, KEY), undefined)
  const resByDig = get.sync(CACHE, KEY, { memoize: true })
  t.deepEqual(resByDig, {
    metadata: METADATA,
    data: CONTENT,
    integrity: INTEGRITY,
    size: SIZE
  }, 'get returned proper data')
  t.done()
})

test('get.byDigest without memoization', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  index.insert.sync(CACHE, KEY, INTEGRITY, opts())
  get(CACHE, KEY)
    .then((res) => {
      t.deepEqual(
        res,
        {
          metadata: METADATA,
          data: CONTENT,
          integrity: INTEGRITY,
          size: SIZE
        },
        'bulk key get returned proper data')

      memo.clearMemoized()
      t.same(memo.get.byDigest(CACHE, INTEGRITY), undefined)
      return get.byDigest(CACHE, INTEGRITY)
        .then((resByDig) => {
          t.deepEqual(resByDig, CONTENT, 'byDigest returned proper data')
          t.same(memo.get.byDigest(CACHE, INTEGRITY), undefined)

          return get.byDigest(CACHE, INTEGRITY)
        })
        .then((resByDigMemo) => {
          t.deepEqual(resByDigMemo, CONTENT, 'byDigest returned proper data')
          t.done()
        })
    })
})

test('get.byDigest with memoization', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  index.insert.sync(CACHE, KEY, INTEGRITY, opts())
  get(CACHE, KEY)
    .then((res) => {
      t.deepEqual(
        res,
        {
          metadata: METADATA,
          data: CONTENT,
          integrity: INTEGRITY,
          size: SIZE
        },
        'bulk key get returned proper data')

      memo.clearMemoized()
      t.same(memo.get.byDigest(CACHE, INTEGRITY), undefined)
      return get.byDigest(CACHE, INTEGRITY, { memoize: true })
        .then((resByDig) => {
          t.deepEqual(resByDig, CONTENT, 'byDigest returned proper data')
          t.notSame(memo.get.byDigest(CACHE, INTEGRITY), undefined)

          return get.byDigest(CACHE, INTEGRITY, { memoize: true })
        })
        .then((resByDigMemo) => {
          t.deepEqual(resByDigMemo, CONTENT, 'byDigest returned proper data')
          t.done()
        })
    })
})

test('get without memoization', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  index.insert.sync(CACHE, KEY, INTEGRITY, opts())
  get(CACHE, KEY)
    .then((res) => {
      t.deepEqual(
        res,
        {
          metadata: METADATA,
          data: CONTENT,
          integrity: INTEGRITY,
          size: SIZE
        },
        'bulk key get returned proper data')

      memo.clearMemoized()
      t.same(memo.get(CACHE, KEY), undefined)
      return get(CACHE, KEY)
        .then((resByDig) => {
          t.deepEqual(resByDig, {
            metadata: METADATA,
            data: CONTENT,
            integrity: INTEGRITY,
            size: SIZE
          }, 'get returned proper data')
          t.same(memo.get(CACHE, KEY), undefined)

          return get(CACHE, KEY)
        })
        .then((resByDigMemo) => {
          t.deepEqual(resByDigMemo, {
            metadata: METADATA,
            data: CONTENT,
            integrity: INTEGRITY,
            size: SIZE
          }, 'get returned proper data')
          t.done()
        })
    })
})

test('get with memoization', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  index.insert.sync(CACHE, KEY, INTEGRITY, opts())
  get(CACHE, KEY)
    .then((res) => {
      t.deepEqual(
        res,
        {
          metadata: METADATA,
          data: CONTENT,
          integrity: INTEGRITY,
          size: SIZE
        },
        'bulk key get returned proper data')

      memo.clearMemoized()
      t.same(memo.get(CACHE, KEY), undefined)
      return get(CACHE, KEY, { memoize: true })
        .then((resByDig) => {
          t.deepEqual(resByDig, {
            metadata: METADATA,
            data: CONTENT,
            integrity: INTEGRITY,
            size: SIZE
          }, 'get returned proper data')
          t.notSame(memo.get(CACHE, KEY), undefined)

          return get(CACHE, KEY, { memoize: true })
        })
        .then((resByDigMemo) => {
          t.deepEqual(resByDigMemo, {
            metadata: METADATA,
            data: CONTENT,
            integrity: INTEGRITY,
            size: SIZE
          }, 'get returned proper data')
          t.done()
        })
    })
})

test('basic stream get', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index.insert(CACHE, KEY, INTEGRITY, opts()).then(() => {
    return Promise.all([
      streamGet(false, CACHE, KEY),
      streamGet(true, CACHE, INTEGRITY)
    ]).then(([byKey, byDigest]) => {
      t.deepEqual(
        byKey,
        {
          data: CONTENT,
          integrity: INTEGRITY,
          metadata: METADATA,
          size: SIZE
        },
        'got all expected data and fields from key fetch'
      )
      t.deepEqual(byDigest.data, CONTENT, 'got correct data from digest fetch')
    })
  })
})

test('get.stream add new listeners post stream creation', (t) => {
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)

  t.plan(3)
  return index.insert(CACHE, KEY, INTEGRITY, opts()).then(() => {
    const OPTS = { memoize: false, size: CONTENT.length }
    const stream = get.stream(CACHE, KEY, OPTS)

    // Awaits index.find in order to synthetically retrieve a point in runtime
    // in which the stream has already been created and has the entry data
    // available, allowing for the validation of the newListener event handler
    return index.find(CACHE, KEY)
      .then(() => {
        [
          'integrity',
          'metadata',
          'size'
        ].forEach(ev => {
          stream.on(ev, () => {
            t.ok(`${ev} listener added`)
          })
        })
        return stream.concat()
      })
  })
})

test('get.copy will throw ENOENT if not found', (t) => {
  const DEST = path.join(CACHE, 'not-found')
  return get.copy(CACHE, 'NOT-FOUND', DEST)
    .then(() => {
      throw new Error('lookup should fail')
    })
    .catch((err) => {
      t.ok(err, 'got an error')
      t.equal(err.code, 'ENOENT', 'error code is ENOENT')
    })
})

test('get.copy with fs.copyfile', {
  skip: !fs.copyFile && 'Not supported on node versions without fs.copyFile'
}, (t) => {
  const DEST = path.join(CACHE, 'copymehere')
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index
    .insert(CACHE, KEY, INTEGRITY, opts())
    .then(() => get.copy(CACHE, KEY, DEST))
    .then((res) => {
      t.deepEqual(
        res,
        {
          metadata: METADATA,
          integrity: INTEGRITY,
          size: SIZE
        },
        'copy operation returns basic metadata'
      )
      return readFile(DEST)
    })
    .then((data) => {
      t.deepEqual(data, CONTENT, 'data copied by key matches')
      return rimraf(DEST)
    })
    .then(() => get.copy.byDigest(CACHE, INTEGRITY, DEST))
    .then(() => readFile(DEST))
    .then((data) => {
      t.deepEqual(data, CONTENT, 'data copied by digest matches')
      return rimraf(DEST)
    })
})

test('get.copy without fs.copyfile', (t) => {
  const readModuleCache = require.cache[require.resolve('./../lib/content/read')]
  delete readModuleCache.exports.copy

  const DEST = path.join(CACHE, 'copymehere')
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index
    .insert(CACHE, KEY, INTEGRITY, opts())
    .then(() => get.copy(CACHE, KEY, DEST))
    .then((res) => {
      t.deepEqual(
        res,
        {
          metadata: METADATA,
          integrity: INTEGRITY,
          size: SIZE
        },
        'copy operation returns basic metadata'
      )
      return readFile(DEST)
    })
    .then((data) => {
      t.deepEqual(data, CONTENT, 'data copied by key matches')
      return rimraf(DEST)
    })
    .then(() => get.copy.byDigest(CACHE, INTEGRITY, DEST))
    .then(() => readFile(DEST))
    .then((data) => {
      t.deepEqual(data, CONTENT, 'data copied by digest matches')
      return rimraf(DEST)
    })
})

test('memoizes data on bulk read', (t) => {
  memo.clearMemoized()
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index.insert(CACHE, KEY, INTEGRITY, opts()).then((ENTRY) => {
    return get(CACHE, KEY)
      .then(() => {
        t.deepEqual(memo.get(CACHE, KEY), null, 'no memoization!')
        return get(CACHE, KEY, { memoize: true })
      })
      .then((res) => {
        t.deepEqual(
          res,
          {
            metadata: METADATA,
            data: CONTENT,
            integrity: INTEGRITY,
            size: SIZE
          },
          'usual data returned'
        )
        t.deepEqual(
          memo.get(CACHE, KEY),
          {
            entry: ENTRY,
            data: CONTENT
          },
          'data inserted into memoization cache'
        )
        return rimraf(CACHE)
      })
      .then(() => {
        return get(CACHE, KEY)
      })
      .then((res) => {
        t.deepEqual(
          res,
          {
            metadata: METADATA,
            data: CONTENT,
            integrity: INTEGRITY,
            size: SIZE
          },
          'memoized data fetched by default'
        )
        return get(CACHE, KEY, { memoize: false })
          .then(() => {
            throw new Error('expected get to fail')
          })
          .catch((err) => {
            t.ok(err, 'got an error from unmemoized get')
            t.equal(err.code, 'ENOENT', 'cached content not found')
            t.deepEqual(
              memo.get(CACHE, KEY),
              {
                entry: ENTRY,
                data: CONTENT
              },
              'data still in memoization cache'
            )
          })
      })
  })
})

test('memoizes data on stream read', (t) => {
  memo.clearMemoized()
  const fixture = new Tacks(
    CacheContent({
      [INTEGRITY]: CONTENT
    })
  )
  fixture.create(CACHE)
  return index.insert(CACHE, KEY, INTEGRITY, opts()).then((ENTRY) => {
    return Promise.all([
      streamGet(false, CACHE, KEY),
      streamGet(true, CACHE, INTEGRITY)
    ])
      .then(() => {
        t.deepEqual(memo.get(CACHE, KEY), null, 'no memoization by key!')
        t.deepEqual(
          memo.get.byDigest(CACHE, INTEGRITY),
          null,
          'no memoization by digest!'
        )
      })
      .then(() => {
        memo.clearMemoized()
        return streamGet(true, CACHE, INTEGRITY, {
          memoize: true
        })
      })
      .then((byDigest) => {
        t.deepEqual(byDigest.data, CONTENT, 'usual data returned from stream')
        t.deepEqual(memo.get(CACHE, KEY), null, 'digest fetch = no key entry')
        t.deepEqual(
          memo.get.byDigest(CACHE, INTEGRITY),
          CONTENT,
          'content memoized'
        )
        t.deepEqual(
          memo.get.byDigest('whatev', INTEGRITY),
          null,
          'content memoization filtered by cache'
        )
      })
      .then(() => {
        memo.clearMemoized()
        return streamGet(false, CACHE, KEY, { memoize: true })
      })
      .then((byKey) => {
        t.deepEqual(
          byKey,
          {
            metadata: METADATA,
            data: CONTENT,
            integrity: INTEGRITY,
            size: SIZE
          },
          'usual data returned from key fetch'
        )
        t.deepEqual(
          memo.get(CACHE, KEY),
          {
            entry: ENTRY,
            data: CONTENT
          },
          'data inserted into memoization cache'
        )
        t.deepEqual(
          memo.get.byDigest(CACHE, INTEGRITY),
          CONTENT,
          'content memoized by digest, too'
        )
        t.deepEqual(
          memo.get('whatev', KEY),
          null,
          'entry memoization filtered by cache'
        )
      })
      .then(() => {
        return rimraf(CACHE)
      })
      .then(() => {
        return Promise.all([
          streamGet(false, CACHE, KEY),
          streamGet(true, CACHE, INTEGRITY)
        ]).then(([byKey, byDigest]) => {
          t.deepEqual(
            byKey,
            {
              metadata: METADATA,
              data: CONTENT,
              integrity: INTEGRITY,
              size: SIZE
            },
            'key fetch fulfilled by memoization cache'
          )
          t.deepEqual(
            byDigest.data,
            CONTENT,
            'digest fetch fulfilled by memoization cache'
          )
        })
      })
      .then(() => {
        return Promise.all([
          streamGet(false, CACHE, KEY, {
            memoize: false
          }).catch((err) => err),
          streamGet(true, CACHE, INTEGRITY, {
            memoize: false
          }).catch((err) => err)
        ]).then(([keyErr, digestErr]) => {
          t.equal(keyErr.code, 'ENOENT', 'key get memoization bypassed')
          t.equal(keyErr.code, 'ENOENT', 'digest get memoization bypassed')
        })
      })
  })
})

test('get.info uses memoized data', (t) => {
  memo.clearMemoized()
  const ENTRY = {
    key: KEY,
    integrity: INTEGRITY,
    time: +new Date(),
    size: SIZE,
    metadata: null
  }
  memo.put(CACHE, ENTRY, CONTENT)
  return get.info(CACHE, KEY).then((info) => {
    t.deepEqual(info, ENTRY, 'got the entry from memoization cache')
  })
})

test('identical hashes with different algorithms do not conflict')
test('throw error if something is really wrong with bucket')
