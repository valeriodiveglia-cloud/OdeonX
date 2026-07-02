const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/valerio/.gemini/antigravity/brain/8c8b7827-f1fb-420a-b004-91d9a22c3062/.system_generated/logs/transcript.jsonl';

async function run() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const types = {};
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      types[obj.type] = (types[obj.type] || 0) + 1;
    } catch(e) {}
  }
  console.log(types);
}

run();
