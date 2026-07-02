const ExcelJS = require('exceljs');
const fs = require('fs');

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

// Format date to YYYY-MM-DD
function formatDate(val) {
  if (!val) return null;
  let d;
  if (val instanceof Date) {
    d = val;
  } else {
    // Try to parse string
    d = new Date(val);
  }
  if (isNaN(d.getTime())) return null;
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  // 1. Parse Excel data
  const excelStaff = {};
  
  for (const file of files) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(file);
      const isSaigon = file.includes('List of Staff 05.2026 & Service Charge.xlsx') && !file.includes('(1)');
      const branchName = isSaigon ? 'Saigon' : 'Da Lat';
      
      for (const sheetName of ['FULL TIME', 'PART TIME']) {
        const sheet = workbook.getWorksheet(sheetName);
        if (!sheet) continue;
        
        let headers = [];
        let headerRowIdx = 1;
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
        
        for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          const staffName = getVal(row.getCell(2)); // col B
          if (!staffName || staffName === 0 || staffName === '0' || String(staffName).trim() === '' || String(staffName).toLowerCase().includes('total')) {
            continue;
          }
          
          const cleanName = String(staffName).trim().toLowerCase();
          
          // For full time, we extract probation and official start date
          let probationStart = null;
          let officialStart = null;
          
          if (sheetName === 'FULL TIME') {
            // Find columns indices
            const probationIdx = headers.findIndex(h => h && h.toLowerCase().includes('probation start'));
            const officialIdx = headers.findIndex(h => h && h.toLowerCase().includes('official start'));
            
            if (probationIdx !== -1) {
              probationStart = formatDate(getVal(row.getCell(probationIdx + 1)));
            }
            if (officialIdx !== -1) {
              officialStart = formatDate(getVal(row.getCell(officialIdx + 1)));
            }
          }
          
          excelStaff[cleanName] = {
            name: String(staffName).trim(),
            probationStart,
            officialStart,
            sheet: sheetName,
            branch: branchName
          };
        }
      }
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }

  // 2. We mock the staff from the DB we got earlier
  const dbStaff = [
    {"id":"c67af9f0-a24d-4d4e-a978-ed9221ae0f01","full_name":"Aaa Bbb","email":null,"phone":null,"start_date":null},
    {"id":"3c87a2f0-a97a-450d-8a4a-0c6e89613517","full_name":"Bui Quang Huy","email":null,"phone":null,"start_date":"2025-02-06"},
    {"id":"1a90fdf8-912b-4fa6-8054-ca792dfbfa31","full_name":"Bui Van Hiep","email":null,"phone":null,"start_date":"2024-09-22"},
    {"id":"48b9a883-9648-482c-b2b9-8d05cbc5d6dd","full_name":"Dao Don Duong","email":null,"phone":null,"start_date":"2023-03-26"},
    {"id":"f5cf21be-ff41-48bd-be8c-90fbefd8cdd9","full_name":"Dinh Thi Thanh Thao","email":null,"phone":null,"start_date":"2025-01-02"},
    {"id":"d7589d9e-128a-493e-ba1c-b711e7e8ba8c","full_name":"Do Hoang Son","email":null,"phone":null,"start_date":"2025-05-01"},
    {"id":"e1f6bcee-6ce3-4f5d-9103-580fe4d2070d","full_name":"Hoang Minh Tam","email":null,"phone":null,"start_date":"2026-02-08"},
    {"id":"ed53a5c5-2836-479a-b658-38ca986950e7","full_name":"Ngo Thi Hien","email":null,"phone":null,"start_date":"2026-01-19"},
    {"id":"9d35deef-54b7-45b4-a1a1-ae37f6c1beee","full_name":"Ngo Thi Hoa","email":null,"phone":null,"start_date":"2025-03-11"},
    {"id":"357e4a56-4452-402a-9b5e-74a22c40ca8a","full_name":"Nguyen Chien","email":null,"phone":null,"start_date":"2026-05-01"},
    {"id":"702c61ca-f27f-4688-94c4-787182491c65","full_name":"Nguyen Hoang Ngoc Phung","email":null,"phone":null,"start_date":"2026-01-05"},
    {"id":"eb5b0f2a-b9c6-4ab4-ac9b-fb5bebbac8ec","full_name":"Nguyen Huu Phuc","email":null,"phone":null,"start_date":"2023-10-20"},
    {"id":"af73e454-3d1e-4ef7-9596-250c01cfcd10","full_name":"Nguyen Huu Thang","email":null,"phone":null,"start_date":"2026-01-05"},
    {"id":"cfd4c8c8-fdd4-4a5e-b9ff-ffff9cb4bd4b","full_name":"Nguyen Thi Hien","email":null,"phone":null,"start_date":"2023-04-01"},
    {"id":"cb6942b8-ff40-47da-8fc7-21409b7bce76","full_name":"Nguyen Thi Loan Oanh","email":null,"phone":null,"start_date":"2026-01-19"},
    {"id":"6558f06a-4515-4623-8bcc-8bc91ce504c3","full_name":"Nguyen Thi Thuy Linh","email":null,"phone":null,"start_date":null},
    {"id":"1d89bfdd-bbf9-450f-960a-ecfa1dfda96c","full_name":"Nguyen Viet Anh","email":null,"phone":null,"start_date":"2025-05-01"},
    {"id":"2454e729-80d3-4a62-a50b-f6f6c6e5154b","full_name":"Nguyen Yen Thanh","email":null,"phone":null,"start_date":"2026-01-27"},
    {"id":"a1000000-0000-0000-0000-000000000001","full_name":"Outsource Chef 1","email":null,"phone":null,"start_date":null},
    {"id":"a1000000-0000-0000-0000-000000000002","full_name":"Outsource Chef 2","email":null,"phone":null,"start_date":null},
    {"id":"a1000000-0000-0000-0000-000000000003","full_name":"Outsource Chef 3","email":null,"phone":null,"start_date":null},
    {"id":"a2000000-0000-0000-0000-000000000001","full_name":"Outsource Waiter 1","email":null,"phone":null,"start_date":null},
    {"id":"a2000000-0000-0000-0000-000000000002","full_name":"Outsource Waiter 2","email":null,"phone":null,"start_date":null},
    {"id":"018cc488-3931-4787-ba82-f3a4cc16b663","full_name":"Pham Duc Anh","email":null,"phone":null,"start_date":"2026-04-05"},
    {"id":"6e25c0af-9ab3-4cda-acba-1e3dfec3ff21","full_name":"Pham Ngoc Minh Thu","email":null,"phone":null,"start_date":"2025-02-01"},
    {"id":"be21c8cf-dd4a-4a5e-b9ff-ffff9cb4bd4c","full_name":"Pham Thi Ngoc Loan","email":null,"phone":null,"start_date":"2024-11-01"},
    {"id":"18cedee1-2a81-4f6d-a39e-170e9570e762","full_name":"Phan Huyen Tram","email":null,"phone":null,"start_date":"2023-04-26"},
    {"id":"cb98b6d4-c76a-4b82-94fe-502c325ec604","full_name":"Tran Thi Bich Phuong","email":null,"phone":null,"start_date":null},
    {"id":"127d0a3e-ce0b-4ac7-afc8-758d4b6d564a","full_name":"Tran Thi Hong","email":null,"phone":null,"start_date":null},
    {"id":"0ff4a4aa-a8ac-4890-a59f-d42d6c5c0d50","full_name":"Truong Thi Thu Thuy","email":null,"phone":null,"start_date":"2024-01-08"},
    {"id":"9d35deef-54b7-45b4-a1a1-ae37f6c1bee3","full_name":"Truong Tieu Ngoc","email":null,"phone":null,"start_date":null},
    {"id":"1000bb71-8bc8-4ff5-bda2-c8deac07ca0b","full_name":"Vo Le Minh","email":null,"phone":null,"start_date":"2026-05-20"},
    {"id":"ca28399c-e30d-4ef7-b8fa-ec7e4dfb1bfd","full_name":"Vo Thi My Hanh","email":null,"phone":null,"start_date":"2026-03-24"},
    {"id":"dea0145b-58fc-4094-8ac1-5eb707003daa","full_name":"Vo Thien Phat","email":null,"phone":null,"start_date":null},
    {"id":"b960cc53-853c-48c8-97ee-e0804e215d86","full_name":"Vuong Quoc Hoang Long","email":null,"phone":null,"start_date":null},
    {"id":"8ee2e8fa-9016-4598-8f62-c87dbc93dfd0","full_name":"Vuong Thuc Hieu","email":null,"phone":null,"start_date":null}
  ];

  // We want to verify who has start_date in DB, who has not, and how we map them.
  console.log('\n--- MAPPING ANALYSIS ---');
  const updates = [];
  
  // Let's invent dates generator
  // We can use a deterministic random-like seed or predefined invented dates to keep it clean.
  // For part-time staff, we can use 2026-01-01 or 2026-02-01 as reasonable start dates.
  const inventedDates = {
    'aaa bbb': '2026-01-01',
    'outsource chef 1': '2025-10-01',
    'outsource chef 2': '2025-10-01',
    'outsource chef 3': '2025-10-01',
    'outsource waiter 1': '2025-11-01',
    'outsource waiter 2': '2025-11-01',
  };

  const getInventedDate = (nameLower) => {
    if (inventedDates[nameLower]) return inventedDates[nameLower];
    // Otherwise return a date based on length to be semi-random but stable:
    // e.g. 2026-01-15 or 2025-12-01
    const day = 1 + (nameLower.length % 28);
    const month = 1 + (nameLower.length % 12);
    const year = 2025 + (nameLower.length % 2);
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  };

  for (const staff of dbStaff) {
    const cleanName = staff.full_name.trim().toLowerCase();
    const excelData = excelStaff[cleanName];
    
    let resolvedDate = null;
    let source = '';
    
    if (excelData) {
      if (excelData.officialStart) {
        resolvedDate = excelData.officialStart;
        source = `Excel Official Start (${excelData.branch} - ${excelData.sheet})`;
      } else if (excelData.probationStart) {
        resolvedDate = excelData.probationStart;
        source = `Excel Probation Start (${excelData.branch} - ${excelData.sheet})`;
      } else {
        resolvedDate = getInventedDate(cleanName);
        source = `Excel Found (${excelData.sheet}) but No Dates - INVENTED`;
      }
    } else {
      resolvedDate = getInventedDate(cleanName);
      source = `Not Found in Excel - INVENTED`;
    }
    
    const needsUpdate = staff.start_date !== resolvedDate;
    
    updates.push({
      id: staff.id,
      name: staff.full_name,
      current: staff.start_date,
      proposed: resolvedDate,
      source,
      needsUpdate
    });
  }
  
  console.log(JSON.stringify(updates, null, 2));
}

main();
