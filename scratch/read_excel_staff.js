const ExcelJS = require('exceljs');

const files = [
  '/Users/valerio/Desktop/List of Staff 05.2026 & Service Charge.xlsx',
  '/Users/valerio/Desktop/List of Staff 05.2026 & Service Charge (1).xlsx'
];

function getVal(cell) {
  if (!cell) return null;
  if (cell.value && typeof cell.value === 'object' && 'result' in cell.value) {
    return cell.value.result;
  }
  return cell.value;
}

async function main() {
  for (const file of files) {
    console.log('==================================================');
    console.log(`File: ${file}`);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(file);
      for (const name of ['FULL TIME', 'PART TIME']) {
        const sheet = workbook.getWorksheet(name);
        if (!sheet) {
          console.log(`Sheet ${name} not found`);
          continue;
        }
        console.log(`\nSheet: ${name} (${sheet.rowCount} rows)`);
        
        // Find headers
        let headers = [];
        let headerRowIdx = 1;
        // Search first few rows for headers
        for (let r = 1; r <= 5; r++) {
          const row = sheet.getRow(r);
          const vals = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            vals.push(getVal(cell));
          });
          if (vals.some(v => v && typeof v === 'string' && (v.toLowerCase().includes('staff') || v.toLowerCase().includes('name')))) {
            headers = vals;
            headerRowIdx = r;
            break;
          }
        }
        console.log(`Headers at row ${headerRowIdx}:`, headers.filter(Boolean));
        
        for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          const staffName = getVal(row.getCell(2)); // usually B is staff name
          if (!staffName || staffName === 0 || staffName === '0' || String(staffName).trim() === '' || String(staffName).toLowerCase().includes('total')) {
            continue;
          }
          
          const rowData = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber - 1] || `Col_${colNumber}`;
            rowData[header] = getVal(cell);
          });
          console.log(`Row ${r}:`, JSON.stringify(rowData));
        }
      }
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }
}

main();
