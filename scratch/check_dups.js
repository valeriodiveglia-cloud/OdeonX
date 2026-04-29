const fs = require('fs')
const content = fs.readFileSync('src/lib/i18n.ts', 'utf8')

const lines = content.split('\n')
const seenEN = new Set()
const seenVI = new Set()
let currentObj = null

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim()
  if (line.includes('export const EN = {')) currentObj = seenEN;
  else if (line.includes('export const VI = {')) currentObj = seenVI;
  else if (line === '}') currentObj = null;
  else if (currentObj) {
    const match = line.match(/^([A-Za-z0-9_]+)\s*:/)
    if (match) {
      const key = match[1]
      if (currentObj.has(key)) {
        console.log(`Duplicate in ${currentObj === seenEN ? 'EN' : 'VI'} at line ${i + 1}: ${key}`)
      }
      currentObj.add(key)
    }
  }
}
