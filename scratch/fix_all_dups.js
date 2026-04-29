const fs = require('fs')
const content = fs.readFileSync('src/lib/i18n.ts', 'utf8')

let lines = content.split('\n')
let currentLang = null
let seenEN = new Set()
let seenVI = new Set()

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  if (line.match(/^\s*en:\s*\{\s*$/)) {
    currentLang = seenEN
  } else if (line.match(/^\s*vi:\s*\{\s*$/)) {
    currentLang = seenVI
  }

  if (currentLang) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*:/)
    if (match) {
      const key = match[1]
      if (currentLang.has(key)) {
        // Find if this line has a multiline value or just comma at the end.
        // Assuming user copied single-line translations mostly.
        lines[i] = '// DELETED DUPLICATE: ' + match[0]
      } else {
        currentLang.add(key)
      }
    }
  }
}

const newContent = lines.filter(l => !l.startsWith('// DELETED DUPLICATE')).join('\n')
fs.writeFileSync('src/lib/i18n.ts', newContent)
