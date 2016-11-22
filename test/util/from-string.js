var through = require('through2')

module.exports = fromString
function fromString (str) {
  var stream = through()
  setTimeout(function () {
    stream.write(str)
    stream.end()
  })
  return stream
}
