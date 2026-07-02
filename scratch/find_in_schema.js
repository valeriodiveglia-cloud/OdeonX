const fs = require('fs');
const content = fs.readFileSync('odeonx_schema.sql', 'utf8');

const search = (word) => {
    console.log(`=== Matches for: ${word} ===`);
    const regex = new RegExp(word, 'gi');
    let match;
    while ((match = regex.exec(content)) !== null) {
        const start = Math.max(0, match.index - 100);
        const end = Math.min(content.length, match.index + 100);
        console.log(`[Index ${match.index}]: ...${content.substring(start, end).replace(/\n/g, ' ')}...`);
    }
};

search('daily_sales');
search('pnl');
search('sales');
search('revenue');
