/** Quote every cell and neutralize spreadsheet formulas in user-supplied names. */
export function toCsv(rows: string[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const cell = /^\s*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + cell.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
