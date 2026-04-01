
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

export function exportToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
            if (cell === null || cell === undefined) return ''
            const s = String(cell).replace(/"/g, '""')
            return `"${s}"`
        }).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

export type ExcelColumn = {
    header: string
    key: string
    width?: number
    // boolean=true means sum. string means specific label (e.g. 'Total')
    total?: boolean | string
    fmt?: string
}

export async function exportToExcelTable(
    sheetName: string,
    fileName: string,
    columns: ExcelColumn[],
    data: any[],
    extraRows?: any[][],
    /** If true, returns the file as a Blob instead of triggering a download */
    returnBlob?: boolean
): Promise<Blob | void> {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(sheetName)

    // Map to ExcelJS Table columns
    const tableColumns = columns.map(col => {
        const obj: any = { name: col.header }
        if (col.total === true) {
            obj.totalsRowFunction = 'sum'
        } else if (typeof col.total === 'string') {
            obj.totalsRowLabel = col.total
        }
        return obj
    })

    // Prepare rows (order follows columns array)
    // Note: ExcelJS addTable expects rows to be array of arrays if using columns definition
    // matching the order of columns.
    const rows = data.map(item => {
        return columns.map(col => item[col.key])
    })

    // Add Table
    // Sanitize table name (must be unique, no spaces)
    const safeTableName = sheetName.replace(/[^a-zA-Z0-9_]/g, '') + '_Table'

    sheet.addTable({
        name: safeTableName,
        ref: 'A1',
        headerRow: true,
        totalsRow: true,
        style: {
            theme: 'TableStyleMedium2', // Nice blue style
            showRowStripes: true,
        },
        columns: tableColumns,
        rows: rows,
    })

    // Apply column widths (safe to set on the column object)
    columns.forEach((col, i) => {
        const sheetCol = sheet.getColumn(i + 1)
        sheetCol.width = col.width || 15
    })

    // Apply numFmt cell-by-cell to avoid ExcelJS bug where column-level
    // numFmt applied after addTable corrupts table cell values to 0.
    const dataRowCount = data.length
    columns.forEach((col, colIdx) => {
        const fmt = col.fmt || (col.total === true ? '#,##0' : null)
        if (!fmt) return
        for (let rowIdx = 0; rowIdx < dataRowCount; rowIdx++) {
            // Row 1 = header, data starts at row 2, totals at row dataRowCount+2
            const cell = sheet.getCell(rowIdx + 2, colIdx + 1)
            cell.numFmt = fmt
        }
        // Also format the totals row
        const totalsCell = sheet.getCell(dataRowCount + 2, colIdx + 1)
        totalsCell.numFmt = fmt
    })

    if (extraRows && extraRows.length > 0) {
        sheet.addRow([]) // Spacer
        extraRows.forEach(r => sheet.addRow(r))
    }

    const buf = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buf])

    if (returnBlob) {
        return blob
    }

    saveAs(blob, fileName)
}
