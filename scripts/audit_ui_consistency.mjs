import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve('src/app');
const REPORT_PATH = path.resolve('/Users/valerio/.gemini/antigravity/brain/28e3aff0-1ce8-4483-906d-644802b8d6a8/ui_consistency_report.md');

// Helper for recursive file search
function getFiles(dir, extList) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath, extList));
    } else {
      if (extList.includes(path.extname(file))) {
        results.push(filePath);
      }
    }
  });
  return results;
}

// Read and analyze files
function runAudit() {
  console.log('🔍 Avvio scansione di coerenza grafica nelle pagine...');
  
  const files = getFiles(APP_DIR, ['.tsx', '.ts']);
  console.log(`📋 Trovati ${files.length} file di codice da esaminare.`);
  
  const results = {
    datePickers: [],
    buttonVariations: [],
    dropdowns: [],
    titleIcons: []
  };

  files.forEach((file) => {
    const relativePath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf-8');

    // Skip layout files or styles
    if (file.endsWith('globals.css') || file.includes('node_modules')) return;

    // 1. Date/Month Pickers Audit
    // Cerchiamo flatpickr, date pickers o controlli di mese custom (bottoni avanti/indietro)
    const hasFlatpickr = content.includes('Flatpickr') || content.includes('flatpickr');
    const hasMuiDatePicker = content.includes('DatePicker') || content.includes('x-date-pickers');
    const hasNativeDate = content.includes('type="date"');
    const hasCustomMonthSelect = /month|selectMonth|prevMonth|nextMonth|changeMonth/i.test(content) && content.includes('<button');

    if (hasFlatpickr || hasMuiDatePicker || hasNativeDate || hasCustomMonthSelect) {
      const types = [];
      if (hasFlatpickr) types.push('Flatpickr');
      if (hasMuiDatePicker) types.push('MUI DatePicker');
      if (hasNativeDate) types.push('Input Date Nativo');
      if (hasCustomMonthSelect) types.push('Controllo Mese Personalizzato (Bottoni/Freccia)');
      results.datePickers.push({ file: relativePath, types });
    }

    // 2. Button styling variations
    // Cerchiamo i bottoni e catturiamo le loro classi per vedere i colori di sfondo
    const buttonRegex = /<button[^>]*className=["']([^"']+)["']/g;
    let btnMatch;
    const btnClasses = [];
    while ((btnMatch = buttonRegex.exec(content)) !== null) {
      const cls = btnMatch[1];
      // Registriamo se usa classi di colore non standard o stili strani
      if (cls.includes('bg-') && !cls.includes('bg-transparent') && !cls.includes('bg-white') && !cls.includes('bg-slate-900') && !cls.includes('bg-[#0B1537]')) {
        const bgColors = cls.split(' ').filter(c => c.startsWith('bg-'));
        bgColors.forEach(col => {
          if (!btnClasses.includes(col)) btnClasses.push(col);
        });
      }
    }
    if (btnClasses.length > 0) {
      results.buttonVariations.push({ file: relativePath, colors: btnClasses });
    }

    // 3. Dropdown / Select Audit
    // Cerchiamo tag select, Listbox o Menu di headlessui e le loro classi di colore per il contrasto
    const hasSelect = content.includes('<select') || content.includes('Listbox') || content.includes('Menu');
    if (hasSelect) {
      const types = [];
      if (content.includes('<select')) types.push('Select Nativo');
      if (content.includes('Listbox')) types.push('HeadlessUI Listbox');
      if (content.includes('Menu')) types.push('HeadlessUI Menu');

      // Verifichiamo se ci sono stili inline o colori strani nelle vicinanze delle classi di dropdown
      const selectClassRegex = /<(?:select|Listbox|Menu)[^>]*className=["']([^"']+)["']/g;
      let selMatch;
      const classes = [];
      while ((selMatch = selectClassRegex.exec(content)) !== null) {
        classes.push(selMatch[1]);
      }
      results.dropdowns.push({ file: relativePath, types, classes });
    }

    // 4. Icons near page titles (h1)
    // Cerchiamo h1 e controlliamo se contengono icone al loro interno o nelle righe vicine
    const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/g;
    let h1Match;
    while ((h1Match = h1Regex.exec(content)) !== null) {
      const inner = h1Match[1];
      // Controlliamo se contiene un'icona (es. <PlusIcon, <Arrow, <Trash, ecc.)
      const hasIcon = /[A-Z][a-zA-Z]*Icon\b/.test(inner);
      if (hasIcon) {
        results.titleIcons.push({ file: relativePath, titleText: inner.trim().replace(/\s+/g, ' ') });
      }
    }
  });

  generateReport(results);
}

// Generate the markdown report
function generateReport(results) {
  let md = `# Report di Coerenza Grafica e Stile (UI Consistency Audit)

Questo report elenca le potenziali incoerenze di stile, componenti duplicate e disallineamenti di design rilevati scansionando il codice del frontend.

---

## 1. Selettori di Date e Mesi (Date/Month Pickers)
*Verifica la presenza di molteplici sistemi per la selezione di date e mesi nelle tabelle.*

| File | Tecnologie / Componenti Rilevate |
| :--- | :--- |
`;

  if (results.datePickers.length === 0) {
    md += '| Nessuno | Nessuno |\n';
  } else {
    results.datePickers.forEach(item => {
      md += `| [${path.basename(item.file)}](file:///${path.resolve(item.file)}) | \`${item.types.join(', ')}\` |\n`;
    });
  }

  md += `
---

## 2. Variazioni di Colore nei Pulsanti (Buttons bg-colors)
*Elenca le classi di colore di sfondo (bg) non standard utilizzate per i bottoni.*

| File | Colori di Sfondo Rilevati |
| :--- | :--- |
`;

  if (results.buttonVariations.length === 0) {
    md += '| Nessuno | Nessuno |\n';
  } else {
    results.buttonVariations.forEach(item => {
      md += `| [${path.basename(item.file)}](file:///${path.resolve(item.file)}) | \`${item.colors.join(', ')}\` |\n`;
    });
  }

  md += `
---

## 3. Componenti Dropdown e Select
*Analisi dei controlli di selezione e delle relative classi grafiche.*

| File | Tipi Rilevati | Esempi di Classi Rilevate |
| :--- | :--- | :--- |
`;

  if (results.dropdowns.length === 0) {
    md += '| Nessuno | Nessuno | Nessuno |\n';
  } else {
    results.dropdowns.forEach(item => {
      const clsExcerpt = item.classes.length > 0 ? item.classes.map(c => c.slice(0, 40) + '...').join(' \| ') : '-';
      md += `| [${path.basename(item.file)}](file:///${path.resolve(item.file)}) | \`${item.types.join(', ')}\` | \`${clsExcerpt}\` |\n`;
    });
  }

  md += `
---

## 4. Icone nei Titoli Principali (h1)
*Rileva se un'icona è stata inserita all'interno del tag del titolo principale (h1).*

| File | Contenuto del Titolo Rilevato |
| :--- | :--- |
`;

  if (results.titleIcons.length === 0) {
    md += '| Nessuno | Nessuno |\n';
  } else {
    results.titleIcons.forEach(item => {
      md += `| [${path.basename(item.file)}](file:///${path.resolve(item.file)}) | \`${item.titleText}\` |\n`;
    });
  }

  fs.writeFileSync(REPORT_PATH, md);
  console.log(`✅ Report generato con successo in: ${REPORT_PATH}`);
}

runAudit();
