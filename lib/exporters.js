const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// --- Shared bill math (kept in sync with routes/houses.js) -----------------
function computeBill(house) {
  const consumed = Math.max(0, house.current_reading - house.previous_reading);
  const billable = Math.max(0, consumed - house.free_limit_l);
  const total = Math.round(billable * house.rate_per_litre * 100) / 100;
  return { consumed, billable, total };
}

function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// Builds a flat description of a building + all its houses, ready to hand to
// any of the three exporters below.
function buildBuildingExport(building, houses) {
  const enriched = houses.map((h) => ({ ...h, bill: computeBill(h) }));
  const totalConsumption = enriched.reduce((sum, h) => sum + h.bill.consumed, 0);
  const totalBillAmount = enriched.reduce((sum, h) => sum + h.bill.total, 0);
  const paidBills = enriched.filter((h) => h.status === 'Paid').length;
  const pendingBills = enriched.filter((h) => h.status === 'Pending').length;
  // The rate/free-limit fields live per-house (each house can override the
  // default), so the building-level summary reports the most common values
  // across its houses rather than inventing a single building-wide setting.
  const mode = (values) => {
    if (!values.length) return 0;
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const waterRate = mode(enriched.map((h) => h.rate_per_litre));
  const freeLimit = mode(enriched.map((h) => h.free_limit_l));

  return {
    summary: {
      'Building Name': building.name,
      'Building Address': building.location || '—',
      'Export Date': fmtDate(new Date().toISOString()),
      'Total Houses': enriched.length,
      'Water Rate': `${money(waterRate)} / L`,
      'Free Water Limit': `${freeLimit.toLocaleString('en-IN')} L`,
      'Total Water Consumption': `${totalConsumption.toLocaleString('en-IN')} L`,
      'Total Bill Amount': money(totalBillAmount),
      'Paid Bills': paidBills,
      'Pending Bills': pendingBills,
    },
    houses: enriched.map((h) => ({
      'House Number': h.house_number,
      'Owner Name': h.resident_name || '—',
      'Phone Number': h.phone_number || '—',
      'Previous Reading': h.previous_reading,
      'Current Reading': h.current_reading,
      'Units Consumed': h.bill.consumed,
      'Bill Amount': h.bill.total,
      'Payment Status': h.status,
      'Last Updated': fmtDate(h.updated_at),
    })),
  };
}

// Same shape as buildBuildingExport but scoped to a single house, so both
// exporters can share one PDF/XLSX/CSV renderer.
function buildHouseExport(building, house) {
  const bill = computeBill(house);
  return {
    summary: {
      'Building Name': building.name,
      'Building Address': building.location || '—',
      'Export Date': fmtDate(new Date().toISOString()),
      'Total Houses': 1,
      'Water Rate': `${money(house.rate_per_litre)} / L`,
      'Free Water Limit': `${Number(house.free_limit_l).toLocaleString('en-IN')} L`,
      'Total Water Consumption': `${bill.consumed.toLocaleString('en-IN')} L`,
      'Total Bill Amount': money(bill.total),
      'Paid Bills': house.status === 'Paid' ? 1 : 0,
      'Pending Bills': house.status === 'Pending' ? 1 : 0,
    },
    houses: [
      {
        'House Number': house.house_number,
        'Owner Name': house.resident_name || '—',
        'Phone Number': house.phone_number || '—',
        'Previous Reading': house.previous_reading,
        'Current Reading': house.current_reading,
        'Units Consumed': bill.consumed,
        'Bill Amount': bill.total,
        'Payment Status': house.status,
        'Last Updated': fmtDate(house.updated_at),
      },
    ],
  };
}

// --- CSV ---------------------------------------------------------------
function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCSV({ summary, houses }) {
  const lines = [];
  lines.push('Summary');
  for (const [key, value] of Object.entries(summary)) {
    lines.push(`${csvEscape(key)},${csvEscape(value)}`);
  }
  lines.push('');
  lines.push('Houses');
  const headers = Object.keys(houses[0] || {});
  lines.push(headers.map(csvEscape).join(','));
  for (const row of houses) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n');
}

// --- XLSX ----------------------------------------------------------------
async function toXLSX({ summary, houses }, title) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Water Bill Management System';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 32 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005E97' } };
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  for (const [field, value] of Object.entries(summary)) {
    summarySheet.addRow({ field, value });
  }

  const housesSheet = workbook.addWorksheet('Houses');
  const headers = Object.keys(houses[0] || {});
  housesSheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 2) }));
  const headerRow = housesSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005E97' } };
  houses.forEach((row) => housesSheet.addRow(row));
  housesSheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}1` };

  return workbook.xlsx.writeBuffer();
}

// --- PDF -------------------------------------------------------------------
function toPDF({ summary, houses }, title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fillColor('#005e97').fontSize(20).font('Helvetica-Bold').text(title, { align: 'left' });
    doc.moveDown(0.3);
    doc.fillColor('#404751').fontSize(10).font('Helvetica').text(`Generated ${fmtDate(new Date().toISOString())}`);
    doc.moveDown(1);

    // Summary box
    const summaryEntries = Object.entries(summary);
    const colWidth = (doc.page.width - 80) / 2;
    let sy = doc.y;
    summaryEntries.forEach(([key, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 40 + col * colWidth;
      const y = sy + row * 18;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#191c1e').text(`${key}: `, x, y, { continued: true });
      doc.font('Helvetica').fillColor('#404751').text(String(value));
    });
    doc.y = sy + Math.ceil(summaryEntries.length / 2) * 18 + 20;

    // Table
    const headers = Object.keys(houses[0] || {});
    const tableWidth = doc.page.width - 80;
    const colWidths = headers.map((h) => {
      if (h === 'Owner Name') return tableWidth * 0.14;
      if (h === 'Payment Status') return tableWidth * 0.09;
      if (h === 'Last Updated') return tableWidth * 0.13;
      return tableWidth * (1 / headers.length) * 0.95;
    });
    const scale = tableWidth / colWidths.reduce((a, b) => a + b, 0);
    const widths = colWidths.map((w) => w * scale);

    const rowHeight = 20;
    const startX = 40;

    function drawHeader(y) {
      doc.rect(startX, y, tableWidth, rowHeight).fill('#005e97');
      let x = startX;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      headers.forEach((h, i) => {
        doc.text(h, x + 4, y + 6, { width: widths[i] - 8, ellipsis: true });
        x += widths[i];
      });
      return y + rowHeight;
    }

    let y = drawHeader(doc.y);

    houses.forEach((row, idx) => {
      if (y + rowHeight > doc.page.height - 40) {
        doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
        y = drawHeader(40);
      }
      if (idx % 2 === 0) doc.rect(startX, y, tableWidth, rowHeight).fill('#f2f4f6');
      let x = startX;
      doc.fontSize(8).font('Helvetica').fillColor('#191c1e');
      headers.forEach((h, i) => {
        let val = row[h];
        if (h === 'Bill Amount') val = money(val);
        doc.text(String(val), x + 4, y + 6, { width: widths[i] - 8, ellipsis: true });
        x += widths[i];
      });
      y += rowHeight;
    });

    doc.end();
  });
}

module.exports = {
  computeBill,
  buildBuildingExport,
  buildHouseExport,
  toCSV,
  toXLSX,
  toPDF,
};
