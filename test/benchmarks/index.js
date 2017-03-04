'use strict'

const Benchmark = require('benchmark')
const chalk = require('chalk')
const fmtms = require('format-number')({round: 4})
const fmtpct = require('format-number')({round: 1, suffix: '%'})
const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')

const CACHE = path.join(__dirname, '../', 'cache', 'benchmarks')
const PREVIOUS = path.join(path.dirname(CACHE), 'last-benchmark.json')
const WARN_RANGE = 5

const suite = new Benchmark.Suite({
  onStart () {
    try {
      this.previous = require(
        process.env.COMPARETO
        ? path.resolve(process.env.COMPARETO)
        : PREVIOUS)
    } catch (e) {}
    console.log('--- cacache performance benchmarks ---')
  },
  onCycle (event) {
    const bench = event.target
    const prev = this.previous && this.previous[bench.name]
    const meanDiff = prev && (-((1 - (bench.stats.mean / prev.stats.mean)) * 100))
    let colorDiff = !prev
    ? ''
    : `${meanDiff > 0 ? '+' : ''}${fmtpct(meanDiff)}`
    colorDiff = ` (${
      meanDiff >= (WARN_RANGE + bench.stats.rme)
      ? chalk.red(colorDiff)
      : meanDiff <= -(WARN_RANGE + bench.stats.rme)
      ? chalk.green(colorDiff)
      : colorDiff
    })`
    console.log(`--- ${bench.name} ---`)
    console.log(`Avg: ${
      fmtms(bench.stats.mean * 1000)
    }ms${colorDiff}`)
    console.log(`SEM: ${fmtms(bench.stats.sem * 1000)}ms`)
    console.log(`RME: ${fmtms(bench.stats.rme)}%`)
    console.log(`Total: ${bench.times.elapsed}s`)
    console.log('--------------------------------------')
    rimraf.sync(CACHE)
  },
  onComplete () {
    console.log('--------------------------------------')
    fs.writeFileSync(PREVIOUS, JSON.stringify(this.reduce((acc, bench) => {
      acc[bench.name] = bench
      return acc
    }, {})), 'utf8')
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
