import { Client } from 'pg';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const dbUrlMatch = envFile.match(/DATABASE_URL="([^"]+)"/);

if (dbUrlMatch) {
  const client = new Client({ connectionString: dbUrlMatch[1] });
  async function run() {
    await client.connect();
    const res = await client.query("SELECT id, full_name FROM hr_staff WHERE full_name ILIKE '%Ngo Thi Hoa%'");
    console.log("STAFF:", res.rows);
    if (res.rows.length > 0) {
       const bRes = await client.query("SELECT b.name FROM hr_staff_branches sb JOIN hr_operational_branches b ON sb.branch_id = b.id WHERE sb.staff_id = $1", [res.rows[0].id]);
       console.log("BRANCHES:", bRes.rows);
    }
    await client.end();
  }
  run();
} else {
  console.log("DATABASE_URL not found");
}
