'use strict'

module.exports.disposer = disposer

function disposer (creatorFn, disposerFn, fn) {
  const runDisposer = (resource, result, shouldThrow = false) => {
    return disposerFn(resource)
      .then(
        // disposer resolved, do something with original fn's promise
        () => {
          if (shouldThrow) {
            throw result
          }
          return result
        },
        // Disposer fn failed, crash process
        (err) => {
          throw err
          // Or process.exit?
        })
  }

  return creatorFn
    .then((resource) => {
      return Promise.resolve(fn(resource))
        .then((result) => runDisposer(resource, result))
        .catch((err) => runDisposer(resource, err, true))
    })
}
