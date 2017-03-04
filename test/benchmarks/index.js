'use strict'

const Benchmark = require('benchmark')
const fmtms = require('format-number')({round: 4})
const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')

const CACHE = path.join(__dirname, '../', 'cache', 'benchmarks')

const suite = new Benchmark.Suite({
  onStart () {
    console.log('--- cacache performance benchmarks ---')
  },
  onCycle (event) {
    const bench = event.target
    console.log(`--- ${bench.name} ---`)
    console.log(`Avg: ${fmtms(bench.stats.mean * 1000)}ms`)
    console.log(`SEM: ${fmtms(bench.stats.sem * 1000)}ms`)
    console.log(`RME: ${fmtms(bench.stats.rme)}%`)
    console.log(`Total: ${bench.times.elapsed}s`)
    console.log('--------------------------------------')
    rimraf.sync(CACHE)
  },
  onComplete () {
    console.log('--------------------------------------')
  }
})

fs.readdir(__dirname, (err, files) => {
  if (err) { throw err }
  files.forEach(f => {
    if (path.extname(f) === '.js' && f !== 'index.js') {
      require('./' + f)(suite, path.join(CACHE, path.basename(f, '.js')))
    }
  })
  suite.run({async: true})
})
