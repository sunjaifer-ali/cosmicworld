import { useState } from "react";
import { sanitizeAmountInput, toCents } from "@/lib/ledger";

type Row = { key: string; item: string; qty: string; price: string };

const SHOP = [
  "COSMIC WORLD FANCY AND COSMETICS",
  "CITY CENTRE COMPLEX, THRIKKADEERI",
  "PALAKKAD-679502",
  "MOB-9495751268",
];

function sanitizeQty(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const next = dot === -1 ? cleaned : `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 1)}`;
  if (next === "" || next === ".") return next;
  const value = Number(next);
  if (!Number.isFinite(value)) return "";
  if (value > 999) return "999";
  return next.replace(/^0+(?=\d)/, "");
}

function lineCents(row: Row): number {
  const qty = Number(row.qty);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty * toCents(row.price || "0"));
}

function billNo(date: string): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `CW-${date.replaceAll("-", "")}-${hh}${mm}`;
}

function rupeesInWords(cents: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const pair = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const chunk = (n: number) => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundred ? `${ones[hundred]} Hundred${rest ? " " : ""}` : ""}${rest ? pair(rest) : ""}`.trim();
  };
  const rupees = Math.floor(Math.abs(cents) / 100);
  const paise = Math.abs(cents) % 100;
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const parts = [
    crore ? `${pair(crore)} Crore` : "",
    lakh ? `${pair(lakh)} Lakh` : "",
    thousand ? `${pair(thousand)} Thousand` : "",
    rest ? chunk(rest) : "",
  ].filter(Boolean);
  const rupeeWords = parts.length ? `${parts.join(" ")} Rupee${rupees === 1 ? "" : "s"}` : "";
  const paiseWords = paise ? `${pair(paise)} Paise` : "";
  return `${[rupeeWords, paiseWords].filter(Boolean).join(" and ")} Only`;
}

function billMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(whole);
  return `${negative ? "−" : ""}₹${grouped}.${frac}`;
}
function blankRow(): Row {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, item: "", qty: "1", price: "" };
}

export function BillForm({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [number, setNumber] = useState(() => billNo(today));
  const [customer, setCustomer] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow(), blankRow()]);
  const [error, setError] = useState("");

  const filled = rows.filter((row) => row.item.trim() && lineCents(row) > 0);
  const total = filled.reduce((sum, row) => sum + lineCents(row), 0);
  const sheetRows = [...filled];
  while (sheetRows.length < 8) {
    sheetRows.push({ key: `blank-${sheetRows.length}`, item: "", qty: "", price: "" });
  }

  function update(key: string, patch: Partial<Row>) {
    setError("");
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function printBill() {
    if (filled.length === 0) {
      setError("Add at least one item, with quantity and price.");
      return;
    }
    setError("");
    document.body.classList.add("printing-bill");
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      document.body.classList.remove("printing-bill");
      window.removeEventListener("afterprint", done);
    };
    const timer = window.setTimeout(done, 60000);
    window.addEventListener("afterprint", done);
    window.print();
  }

  return (
    <div>
      <div className="no-print">
        <h2 className="font-display text-xl leading-tight tracking-tight">Customer bill</h2>
        <p className="mt-1 text-sm text-pretty text-muted">Print only. This is not added to the books.</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Bill no.</span>
            <input
              value={number}
              maxLength={24}
              onChange={(event) => setNumber(event.target.value.replace(/[^\w-]/g, "").slice(0, 24))}
              className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value);
              }}
              className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="mb-1 block text-sm font-medium">Customer name</span>
            <input
              value={customer}
              maxLength={60}
              placeholder="Optional"
              autoComplete="name"
              onChange={(event) => setCustomer(event.target.value.slice(0, 60))}
              className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
            />
          </label>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="w-16 px-2 py-2 font-medium">Qty</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Price</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Total</th>
                <th className="w-12 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5">
                    <input
                      value={row.item}
                      maxLength={48}
                      placeholder="Item name"
                      onChange={(event) => update(row.key, { item: event.target.value.slice(0, 48) })}
                      className="h-10 w-full bg-transparent text-base outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={row.qty}
                      aria-label="Quantity"
                      onChange={(event) => update(row.key, { qty: sanitizeQty(event.target.value) })}
                      className="h-10 w-full bg-transparent text-base tabular-nums outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={row.price}
                      aria-label="Price"
                      placeholder="0"
                      onChange={(event) => update(row.key, { price: sanitizeAmountInput(event.target.value) })}
                      className="h-10 w-full bg-transparent text-right text-base tabular-nums outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{billMoney(lineCents(row))}</td>
                  <td className="px-1 py-1.5 text-center">
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                        className="size-10 rounded-sm text-lg leading-none text-muted"
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length < 20 ? (
          <button type="button" onClick={() => setRows((current) => [...current, blankRow()])} className="mt-2 h-11 rounded-sm bg-wash px-4 text-sm font-medium">
            Add line
          </button>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-semibold tabular-nums">Total {billMoney(total)}</p>
          <div className="flex gap-2">
            <button type="button" onClick={printBill} className="h-11 rounded-sm bg-ink px-4 text-sm font-semibold text-paper">
              Print bill
            </button>
            <button
              type="button"
              onClick={() => {
                setRows([blankRow(), blankRow(), blankRow()]);
                setCustomer("");
                setNumber(billNo(date));
                setError("");
              }}
              className="h-11 rounded-sm bg-wash px-4 text-sm font-medium"
            >
              Clear
            </button>
          </div>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <article className="bill-sheet">
        <header className="bill-head">
          <img src="/shop-mark.jpg" alt="" className="bill-logo" />
          <p className="bill-shop">{SHOP[0]}</p>
          <p>{SHOP[1]}</p>
          <p>{SHOP[2]}</p>
          <p>{SHOP[3]}</p>
        </header>
        <p className="bill-title">BILL</p>
        <div className="bill-meta">
          <p>No. {number || "—"}</p>
          <p>Date {date.split("-").reverse().join("-")}</p>
          <p>{customer.trim() ? `Customer ${customer.trim()}` : "Customer —"}</p>
        </div>
        <table className="bill-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sheetRows.map((row, index) => (
              <tr key={row.key}>
                <td>{row.item ? index + 1 : ""}</td>
                <td>{row.item}</td>
                <td className="num">{row.item ? row.qty : ""}</td>
                <td className="num">{row.item ? billMoney(toCents(row.price)) : ""}</td>
                <td className="num">{row.item ? billMoney(lineCents(row)) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total</td>
              <td className="num">{billMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="bill-words">{rupeesInWords(total)}</p>
        <footer className="bill-foot">
          <p>Thank you. Visit again.</p>
          <div className="bill-sign">
            <p className="bill-line" />
            <p>For Cosmic World</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
