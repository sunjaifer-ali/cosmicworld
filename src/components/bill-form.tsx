import { useState } from "react";
import { centsToAmount, formatInr, sanitizeAmountInput, toCents } from "@/lib/ledger";

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
        <p className="mt-1 text-sm text-pretty text-muted">
          Only when a customer asks. This is not added to sales, cash, or the books.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Bill no.</span>
            <input
              value={number}
              maxLength={24}
              onChange={(event) => setNumber(event.target.value.replace(/[^\w-]/g, "").slice(0, 24))}
              className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value);
              }}
              className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-2 block text-sm font-medium">Customer name</span>
          <input
            value={customer}
            maxLength={60}
            placeholder="Leave blank if the customer does not need it"
            autoComplete="name"
            onChange={(event) => setCustomer(event.target.value.slice(0, 60))}
            className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
          />
        </label>

        <div className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Item {index + 1}</p>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                    className="h-11 rounded-sm px-3 text-sm font-medium text-muted"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                value={row.item}
                maxLength={48}
                placeholder="Item name"
                onChange={(event) => update(row.key, { item: event.target.value.slice(0, 48) })}
                className="mt-2 h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-muted">Qty</span>
                  <input
                    inputMode="decimal"
                    value={row.qty}
                    onChange={(event) => update(row.key, { qty: sanitizeQty(event.target.value) })}
                    className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-muted">Price</span>
                  <input
                    inputMode="decimal"
                    value={row.price}
                    placeholder="0"
                    onChange={(event) => update(row.key, { price: sanitizeAmountInput(event.target.value) })}
                    className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base tabular-nums"
                  />
                </label>
                <div>
                  <p className="mb-1 text-sm text-muted">Total</p>
                  <p className="flex h-11 items-center text-base font-semibold tabular-nums">{formatInr(centsToAmount(lineCents(row)))}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {rows.length < 20 ? (
          <button
            type="button"
            onClick={() => setRows((current) => [...current, blankRow()])}
            className="mt-3 h-11 rounded-sm bg-wash px-4 text-sm font-medium"
          >
            Add item
          </button>
        ) : null}

        <p className="mt-4 text-lg font-semibold tabular-nums">Bill total {formatInr(centsToAmount(total))}</p>
        {error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={printBill} className="h-12 rounded-sm bg-ink px-5 text-base font-semibold text-paper">
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
            className="h-12 rounded-sm bg-wash px-4 text-sm font-medium"
          >
            Clear
          </button>
        </div>
      </div>

      <article className="bill-sheet mt-6">
        <header className="bill-head">
          <img src="/shop-mark.jpg" alt="" className="bill-logo" />
          <p className="bill-shop">{SHOP[0]}</p>
          <p>{SHOP[1]}</p>
          <p>{SHOP[2]}</p>
          <p>{SHOP[3]}</p>
          <p className="bill-title">BILL</p>
          <div className="bill-meta">
            <p>No. {number || "—"}</p>
            <p>Date {date.split("-").reverse().join("-")}</p>
            {customer.trim() ? <p>Customer name: {customer.trim()}</p> : null}
          </div>
        </header>
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
                <td className="num">{row.item ? formatInr(row.price) : ""}</td>
                <td className="num">{row.item ? formatInr(centsToAmount(lineCents(row))) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="bill-total">
          <p>Total</p>
          <p>{formatInr(centsToAmount(total))}</p>
        </div>
        <p className="bill-words">{rupeesInWords(total)}</p>
        <footer className="bill-foot">
          <p>Thank you. Visit again.</p>
          <p>For Cosmic World</p>
        </footer>
      </article>
    </div>
  );
}
