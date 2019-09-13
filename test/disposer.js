'use strict'

const { disposer } = require('./../lib/util/disposer')
const { test } = require('tap')

test('disposerFn should run in resolve', (t) => {
  let disposerRan = false

  const mockCreatorResource = '__creator_resource__'
  const mockFunctionResult = '__function_result__'
  const creatorFn = () => {
    return Promise.resolve(mockCreatorResource)
  }

  const disposerFn = () => {
    disposerRan = true
    return Promise.resolve('Disposer Resolve')
  }

  return disposer(
    creatorFn(),
    disposerFn,
    (data) => {
      t.equal(disposerRan, false, 'disposerFn should not have been called')
      t.equal(data, mockCreatorResource, 'Disposer not returning the created resource to running function')
      return Promise.resolve(mockFunctionResult)
    })
    .then((data) => {
      t.equal(disposerRan, true, 'disposerFn should  have been called')
      t.equal(data, mockFunctionResult, 'Disposer not returning the returned result of the function')
    })
})

test('disposerFn should run in reject', (t) => {
  let disposerRan = false

  const mockCreatorResource = '__creator_resource__'
  const mockFunctionResult = '__function_result__'
  const creatorFn = () => {
    return Promise.resolve(mockCreatorResource)
  }

  const disposerFn = () => {
    disposerRan = true
    return Promise.resolve('Disposer Resolve')
  }

  return disposer(
    creatorFn(),
    disposerFn,
    (data) => {
      t.equal(disposerRan, false, 'disposerFn should not have been called')
      t.equal(data, mockCreatorResource, 'Disposer not returning the created resource to running function')
      return Promise.reject(mockFunctionResult)
    })
    .then(
      () => {
        throw new Error('expected a failure')
      },
      (data) => {
        t.equal(disposerRan, true, 'disposerFn should  have been called')
        t.equal(data, mockFunctionResult, 'Disposer not returning the returned result of the function')
      })
})

test('disposer should reject on creatorFn reject', (t) => {
  let disposerRan = false

  const mockCreatorFailure = '__creator_fn_failure__'
  const creatorFn = () => {
    return Promise.reject(mockCreatorFailure)
  }

  const disposerFn = () => {
    disposerRan = true
    return Promise.resolve('Disposer Resolve')
  }

  return disposer(
    creatorFn(),
    disposerFn,
    (data) => {
      throw new Error('expected a failure')
    })
    .catch((data) => {
      t.equal(disposerRan, false, 'disposerFn should have not have been called')
      t.equal(data, mockCreatorFailure, 'Disposer not passing along the failure from creator function')
    })
})

/**
 * Technically this is breaking the bluebird spec on disposer rejection
 *
 *
 * If a disposer method throws or returns a rejected promise, it's highly likely that it failed to dispose of
 * the resource. In that case, Bluebird has two options - it can either ignore the error and continue with
 * program execution or throw an exception (crashing the process in node.js).
 *
 * In bluebird we've chosen to do the latter because resources are typically scarce. For example, if a database
 * connection cannot be disposed of and Bluebird ignores that, the connection pool will be quickly depleted and
 * the process will become unusable (all requests that query the database will wait forever). Since Bluebird
 * doesn't know how to handle that, the only sensible default is to crash the process. That way, rather than
 * getting a useless process that cannot fulfill more requests, we can swap the faulty worker with a new one
 * letting the OS clean up the resources for us.
 */
test('disposer should reject on disposerFn reject', (t) => {
  let disposerRan = false

  const mockCreatorResource = '__creator_resource__'
  const mockDisposerReject = '__disposer_reject__'
  const creatorFn = () => {
    return Promise.resolve(mockCreatorResource)
  }

  const disposerFn = () => {
    disposerRan = true
    return Promise.reject(mockDisposerReject)
  }

  return disposer(
    creatorFn(),
    disposerFn,
    (data) => {
      return 'foo'
    })
    .then(() => {
      throw new Error('expected a failure')
    })
    .catch((data) => {
      t.equal(disposerRan, true, 'disposerFn should have been called')
      t.equal(data, mockDisposerReject, 'Disposer not passing along the failure from disposer function')
    })
})
