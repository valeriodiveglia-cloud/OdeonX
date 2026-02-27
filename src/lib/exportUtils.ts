
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
    extraRows?: any[][]
) {
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

    // Apply formatting to columns (1-based in ExcelJS)
    columns.forEach((col, i) => {
        const sheetCol = sheet.getColumn(i + 1)
        if (col.width) sheetCol.width = col.width
        else sheetCol.width = 15

        if (col.fmt) sheetCol.numFmt = col.fmt
        else if (col.total === true) sheetCol.numFmt = '#,##0'
    })

    if (extraRows && extraRows.length > 0) {
        sheet.addRow([]) // Spacer
        extraRows.forEach(r => sheet.addRow(r))
    }

    const buf = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buf]), fileName)
}
