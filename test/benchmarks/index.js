'use strict'

const Benchmark = require('benchmark')
const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')

const CACHE = path.join(__dirname, '../', 'cache', 'benchmarks')
const PREVIOUS = path.join(path.dirname(CACHE), 'last-benchmark.json')
const WARN_RANGE = 5

const suite = new Benchmark.Suite({
  onStart () {
    let previousPath = process.env.COMPARETO
      ? path.resolve(process.env.COMPARETO)
      : PREVIOUS
    try {
      this.previous = require(previousPath)
    } catch (e) {}
    console.log('================================================')
    if (this.previous) {
      console.log('  Comparing to', path.relative(process.cwd(), previousPath))
      console.log('================================================')
    }
  },
  onCycle (event) {
    const bench = event.target
    const prev = this.previous && this.previous[bench.name]
    const pctDelta =
      prev && ((bench.stats.mean - prev.stats.mean) / prev.stats.mean) * 100
    let colorDiff = !prev
      ? ''
      : `${pctDelta > 0 ? '+' : ''}${pctDelta.toFixed(2)}% `
    colorDiff = ` (${
      pctDelta >= WARN_RANGE + bench.stats.rme
        ? chalk.red(colorDiff)
        : pctDelta <= -(WARN_RANGE + bench.stats.rme)
          ? chalk.green(colorDiff)
          : colorDiff
    }±${bench.stats.rme.toFixed(2)}%)`
    console.log(`     ${bench.name}`)
    console.log('------------------------------------------------')
    if (bench.error) {
      console.log('Error:', bench.error.message || bench.error)
    } else {
      console.log(
        `  ${bench.hz.toFixed(bench.hz < 100 ? 2 : 0)} ops/s @ ~${(
          bench.stats.mean * 1000
        ).toFixed(3)}ms/op${colorDiff}`
      )
      console.log(
        `  Sampled ${
          bench.stats.sample.length
        } in ${bench.times.elapsed.toFixed(2)}s.`
      )
    }
    console.log('================================================')
    rimraf.sync(CACHE)
  },
  onComplete () {
    fs.writeFileSync(
      PREVIOUS,
      JSON.stringify(
        this.reduce((acc, bench) => {
          acc[bench.name] = bench
          return acc
        }, {})
      ),
      'utf8'
    )
  }
})

fs.readdir(__dirname, (err, files) => {
  if (err) {
    throw err
  }
  files.forEach((f) => {
    if (path.extname(f) === '.js' && f !== 'index.js') {
      require('./' + f)(suite, path.join(CACHE, path.basename(f, '.js')))
    }
  })
  suite.run({ async: true })
})
