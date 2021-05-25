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
