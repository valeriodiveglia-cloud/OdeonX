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
