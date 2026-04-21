const fs = require('fs');
const content = fs.readFileSync('src/app/crm/settings/page.tsx', 'utf8');
let depth = 0;
for(let i=0; i<content.length; i++) {
  if (content[i] === '<' && content[i+1] !== '/' && content[i+1] !== ' ' && content[i+1] !== '=') depth++;
  if (content[i] === '<' && content[i+1] === '/') depth--;
}
console.log("depth roughly", depth);
