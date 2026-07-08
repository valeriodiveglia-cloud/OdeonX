const ExcelJS = require('exceljs');

async function main() {
  const workbook = new ExcelJS.Workbook();
  const filePath = '/Users/valerio/Desktop/Details staff.xlsx';
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  
  const r2 = sheet.getRow(2).values;
  const r3 = sheet.getRow(3).values;
  
  // Count how many non-empty values exist in each column starting from row 4
  const counts = Array(r3.length).fill(0);
  const sampleValues = Array(r3.length).fill(null);
  let totalRows = 0;
  
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber >= 4) {
      totalRows++;
      for (let i = 1; i < r3.length; i++) {
        const val = row.getCell(i).value;
        if (val !== null && val !== undefined && val !== '') {
          counts[i]++;
          if (!sampleValues[i]) {
            sampleValues[i] = val;
          }
        }
      }
    }
  });
  
  console.log('Total data rows:', totalRows);
  console.log('--- COMPILED COLUMNS STATISTICS ---');
  for (let i = 1; i < r3.length; i++) {
    const parent = r2[i] || '';
    const child = r3[i] || '';
    const header = parent === child ? parent : `${parent} -> ${child}`;
    const count = counts[i];
    const percentage = ((count / totalRows) * 100).toFixed(1);
    
    if (count > 0) {
      let sample = sampleValues[i];
      if (typeof sample === 'object' && sample !== null) {
        sample = JSON.stringify(sample);
      }
      console.log(`Column ${i} [${header}]: ${count}/${totalRows} (${percentage}%) filled. Sample: ${sample}`);
    }
  }
}

main().catch(err => {
  console.error(err);
});
