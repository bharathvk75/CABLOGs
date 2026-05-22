import * as XLSX from 'xlsx';
import { TripRecord } from '../types';

function prepareData(records: TripRecord[]) {
  return records.map(r => ({
    'Sl.no': r["Sl.no"],
    'BOOKING ID': r["BOOKING ID"],
    'Category': r.Category,
    'DATE': r.DATE,
    'PASSENGER NAME': r["PASSENGER NAME"],
    'PHONE/ID': r["PHONE/ID"],
    'Driver name': r["Driver name"],
    'Cab No.': r["Cab No."],
    'Reporting address': r["Reporting address"],
    'Drop Address': r["Drop Address"],
    'Shift Time': r["Shift Time"],
    'Duty type': r["Duty type"],
    'Basic Pkg Amt.': r["Basic Pkg Amt."],
    'Minimun Kms': r["Minimun Kms"],
    'Total Kms': r["Total Kms"],
    'Extra Kms': r["Extra Kms"],
    'Extra Kms Amt': r["Extra Kms Amt"],
    'Total Extra kms amt': r["Total Extra kms amt"],
    'Minimun Hrs': r["Minimun Hrs"],
    'Total Hrs': r["Total Hrs"],
    'Extra Hrs': r["Extra Hrs"],
    'Exta Hrs Amt': r["Exta Hrs Amt"],
    'total Extra Hrs Amt': r["total Extra Hrs Amt"],
    'Toll&Parking': r["Toll&Parking"],
    'Total Amt': r["Total Amt"]
  }));
}

export function exportToExcel(records: TripRecord[]) {
  const wb = XLSX.utils.book_new();
  
  // Group by Month-Year
  const grouped: Record<string, TripRecord[]> = {};
    records.forEach(record => {
    let monthYear = 'Unknown';
    if (record.DATE) {
      const parts = record.DATE.split('-');
      if (parts.length === 3) {
        const month = parseInt(parts[1]);
        const year = parts[2];
        const monthName = new Date(2000, month - 1).toLocaleString('default', { month: 'long' });
        monthYear = `${monthName}-${year}`;
      }
    }
    
    if (!grouped[monthYear]) grouped[monthYear] = [];
    grouped[monthYear].push(record);
  });
  
  Object.entries(grouped).forEach(([monthYear, monthRecords]) => {
    const data = prepareData(monthRecords);
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, monthYear);
  });
  
  XLSX.writeFile(wb, `CabLog_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportToCSV(records: TripRecord[]) {
  const data = prepareData(records);
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `CabLog_Report_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
