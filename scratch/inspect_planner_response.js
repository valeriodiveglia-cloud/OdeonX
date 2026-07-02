const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/valerio/.gemini/antigravity/brain/8c8b7827-f1fb-420a-b004-91d9a22c3062/.system_generated/logs/transcript.jsonl';

async function run() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('i18n.ts') && line.includes('PLANNER_RESPONSE')) {
      const obj = JSON.parse(line);
      console.log('Keys:', Object.keys(obj));
      console.log('Content length:', obj.content ? obj.content.length : 0);
      if (obj.content) {
        console.log('Preview:', obj.content.substring(0, 500) + '...');
      }
      break;
    }
  }
}

run();
