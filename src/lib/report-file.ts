import { strToU8, zipSync } from "fflate";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  bankDueDate,
  cashAfterBank,
  categoryLabel,
  centreBreakdown,
  formatInr,
  leftAfter,
  paymentLabel,
  toCents,
  type BooksPayload,
  type ReportRow,
} from "@/lib/ledger";

type Cell = { v: string | number; s?: number };

export async function downloadExcel(books: BooksPayload, rows: ReportRow[], label: string) {
  const file = buildWorkbook(summaryRows(books, label), entryRows(rows));
  saveBlob(
    new Blob([file], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName(books, "xlsx"),
  );
}

export function downloadPdf(books: BooksPayload, rows: ReportRow[], label: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(60, 51, 54);
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(255, 252, 250);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Cosmic World", 14, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(230, 211, 176);
  doc.text("FANCY & COSMETICS", 14, 17);
  doc.setTextColor(60, 51, 54);
  doc.setFontSize(11);
  doc.text(label, 14, 32);
  doc.setFontSize(9);
  doc.setTextColor(111, 101, 104);
  doc.text("Sales, purchases, expenses, and bank pay. Left is not profit.", 14, 37);

  const summary = summaryRows(books, label)
    .filter((row) => row.some((cell) => cell.v !== ""))
    .map((row) => row.map((cell) => pdfText(typeof cell.v === "number" ? formatInr(cell.v.toFixed(2)) : cell.v)));

  autoTable(doc, {
    startY: 42,
    body: summary.map((row) => [row[0] ?? "", row[1] ?? "", row[2] ?? ""]),
    showHead: false,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, textColor: [60, 51, 54], cellPadding: 1.4 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    didParseCell: (hook) => {
      const raw = String(hook.cell.raw ?? "");
      if (raw === raw.toUpperCase() && /[A-Z]/.test(raw)) {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.textColor = [60, 51, 54];
      }
    },
  });

  const after = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 42;
  autoTable(doc, {
    startY: after + 6,
    head: [["Date", "Type", "Detail", "Paid as", "Amount", "Note"]],
    body: entryRows(rows)
      .slice(1)
      .map((row) => row.map((cell) => pdfText(typeof cell.v === "number" ? formatInr(cell.v.toFixed(2)) : String(cell.v)))),
    styles: { font: "helvetica", fontSize: 8, textColor: [60, 51, 54], cellPadding: 1.5 },
    headStyles: { fillColor: [60, 51, 54], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 240, 238] },
    columnStyles: { 4: { halign: "right" } },
    margin: { bottom: 14 },
    didDrawPage: () => {
      const pages = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(122, 112, 114);
      doc.text(`Cosmic World  ·  ${label}  ·  ${pages}`, 14, 290);
    },
  });

  doc.save(fileName(books, "pdf"));
}

function pdfText(value: string) {
  return value.replaceAll("₹", "Rs ").replaceAll("−", "-");
}

function fileName(books: BooksPayload, ext: "xlsx" | "pdf") {
  const span = books.from === books.to ? books.from : `${books.from}-to-${books.to}`;
  return `Cosmic-World-${span}.${ext}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function summaryRows(books: BooksPayload, label: string): Cell[][] {
  const cash = books.payments.find((row) => row.payment === "cash");
  const gpay = books.payments.find((row) => row.payment === "gpay");
  const till = cash
    ? cashAfterBank(cash.sales, cash.purchases, cash.expenses, books.bankGiven, books.bankReturned, cash.gaming)
    : "0.00";
  const rows: Cell[][] = [
    [text("Cosmic World", 2), blank()],
    [text("Fancy & cosmetics"), blank()],
    [text(label, 2), blank()],
    [blank(), blank()],
    [text("TOTALS", 2), text("Amount")],
    [text("Sales"), money(books.salesTotal)],
    [text("Purchases"), money(books.purchaseTotal)],
    [text("Expenses"), money(books.expenseTotal)],
    [text("Left"), money(leftAfter(books.salesTotal, books.purchaseTotal, books.expenseTotal))],
    [blank(), blank()],
    [text("CASH", 2), text("Amount")],
    [text("In"), money(cash?.sales ?? "0")],
    [text("Purchases"), money(cash?.purchases ?? "0")],
    [text("Expenses"), money(cash?.expenses ?? "0")],
    [text("In the till"), money(till)],
    [blank(), blank()],
    [text("GPAY", 2), text("Amount")],
    [text("In"), money(gpay?.sales ?? "0")],
    [text("Purchases"), money(gpay?.purchases ?? "0")],
    [text("Expenses"), money(gpay?.expenses ?? "0")],
    [
      text("Left"),
      money(gpay ? leftAfter(gpay.sales, gpay.purchases, gpay.expenses) : "0.00"),
    ],
    [blank(), blank()],
    [text("BY CATEGORY", 2), text("Sales"), text("Purchases")],
  ];
  for (const row of books.categories) {
    if (toCents(row.sales) === 0 && toCents(row.purchases) === 0) continue;
    rows.push([text(row.label), money(row.sales), money(row.purchases)]);
  }
  rows.push([blank(), blank()], [text("EXPENSES", 2), text("Amount")]);
  for (const row of books.expenses) {
    if (toCents(row.total) === 0) continue;
    rows.push([text(row.label), money(row.total)]);
  }
  rows.push(
    [blank(), blank()],
    [text("BANK PAY", 2), text("Amount")],
    [text("Given this period"), money(books.bankGiven)],
    [text("Received back"), money(books.bankReturned)],
    [text("Interest in that"), money(books.bankInterest)],
    [text("Due back this period"), money(books.bankDue)],
    [text("Still with the bank"), money(books.bankHeld)],
  );
  const centre = centreBreakdown(books, books.rates);
  rows.push([blank(), blank()], [text("CENTRE", 2), text("For us")]);
  for (const row of centre.rows) {
    rows.push([text(`${row.label} ${row.rate}`), money(row.ours)]);
  }
  rows.push(
    [text("Before expenses"), money(centre.margin)],
    [text("Expenses"), money(books.expenseTotal)],
    [text("For us"), money(centre.result)],
  );
  return rows;
}

function entryRows(rows: ReportRow[]): Cell[][] {
  const body = rows.map((row) => [
    text(row.date),
    text(kindLabel(row.kind)),
    text(detailLabel(row)),
    text(row.kind === "bank" ? "Savings" : paymentLabel(row.payment)),
    money(row.amount),
    text(noteLabel(row)),
  ]);
  return [[text("Date", 1), text("Type", 1), text("Detail", 1), text("Paid as", 1), text("Amount", 1), text("Note", 1)], ...body];
}

function kindLabel(kind: ReportRow["kind"]) {
  if (kind === "purchase") return "Purchase";
  if (kind === "expense") return "Expense";
  if (kind === "bank") return "Bank pay";
  if (kind === "gaming") return "Gaming";
  return "Sale";
}

function detailLabel(row: ReportRow) {
  if (row.kind === "gaming") return "Gaming";
  if (row.kind !== "bank") return categoryLabel(row.detail);
  return row.detail === "returned" ? "Received back" : "Given to agent";
}

function noteLabel(row: ReportRow) {
  if (row.kind === "bank" && row.detail === "given") return `Back around ${bankDueDate(row.date)}`;
  if (row.kind === "bank" && row.detail === "returned") return `Interest ${formatInr(row.note || "0")}`;
  return row.note;
}

function text(value: string, style = 0): Cell {
  return { v: value, s: style };
}

function money(value: string): Cell {
  const cents = toCents(value);
  return { v: cents / 100, s: 3 };
}

function blank(): Cell {
  return { v: "" };
}

function buildWorkbook(summary: Cell[][], entries: Cell[][]) {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Entries" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": xml(STYLES),
    "xl/worksheets/sheet1.xml": xml(sheetXml(summary, [28, 16, 16])),
    "xl/worksheets/sheet2.xml": xml(sheetXml(entries, [14, 14, 18, 14, 14, 36])),
  };
  return zipSync(files);
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF3C3336"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF3C3336"/></patternFill></fill>
  </fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;

function sheetXml(rows: Cell[][], widths: number[]) {
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, column) => {
          const ref = `${columnName(column)}${rowIndex + 1}`;
          const style = cell.s ? ` s="${cell.s}"` : "";
          if (typeof cell.v === "number" && Number.isFinite(cell.v)) {
            return `<c r="${ref}"${style}><v>${cell.v}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(String(cell.v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${cols}</cols>
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function columnName(index: number) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function xml(value: string) {
  return strToU8(value);
}
