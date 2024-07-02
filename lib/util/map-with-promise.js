'use strict'

/**
 * Map over a iterable with a concurrency limit, returning a promise that
 * resolves when all items have been processed.
 *
 * @param {Iterable} items iterable of items to process
 * @param {number} concurrency number of items to process concurrently
 * @param {Function} callback function to process each item
 * @returns {Promise} promise that resolves when all items have been processed
 */
function mapWithPromise (items, concurrency, callback) {
  const iterator = items[Symbol.iterator]()
  return Promise.all(
    Array(concurrency)
      .fill(iterator)
      .map(async (iter) => {
        for (const [index, item] of iter) {
          await callback(item, index)
        }
      })
  )
}

module.exports = mapWithPromise
