const fs = require('fs');
let content = fs.readFileSync('src/lib/i18n.ts', 'utf8');

const regexEN = /^\s*Actions:\s*'Actions',\s*$/gm;
let count = 0;
content = content.replace(regexEN, (match, offset) => {
    count++;
    return count > 1 ? '' : match; // Keep the first occurrence, delete others
});

const regexVI = /^\s*Actions:\s*'(Hành động|Thao tác)',\s*$/gm;
count = 0;
content = content.replace(regexVI, (match, offset) => {
    count++;
    return count > 1 ? '' : match; // Keep the first occurrence, delete others
});

fs.writeFileSync('src/lib/i18n.ts', content);
console.log('Fixed duplicates');
