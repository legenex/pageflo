import { readFileSync, writeFileSync } from 'node:fs'
const path = process.argv[2]
const src = readFileSync(path, 'utf8')
let out = ''
let replaced = 0
for (const ch of src) {
  const c = ch.codePointAt(0)
  if (c !== undefined && c < 32 && c !== 10 && c !== 9) {
    out += '|'
    replaced++
  } else {
    out += ch
  }
}
writeFileSync(path, out)
console.log('replaced control bytes:', replaced)
