import { readFileSync } from 'node:fs'
const b = readFileSync(process.argv[2])
const bad = []
for (let i = 0; i < b.length; i++) {
  const c = b[i]
  if (c < 9 || (c > 10 && c < 32) || c === 127) bad.push([i, c])
}
console.log('control bytes:', bad.slice(0, 40))
const s = b.toString('utf8')
const lines = s.split('\n')
lines.forEach((l, i) => {
  for (const ch of l) {
    const c = ch.codePointAt(0)
    if (c < 32 && c !== 9) { console.log('line', i + 1, JSON.stringify(l)); break }
  }
})
