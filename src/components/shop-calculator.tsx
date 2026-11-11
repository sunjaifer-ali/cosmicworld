import { useState } from "react";
import { cn } from "@/lib/cn";

type Op = "+" | "−" | "×" | "÷";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function show(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

function combine(left: number, op: Op, right: number): number {
  if (op === "+") return left + right;
  if (op === "−") return left - right;
  if (op === "×") return left * right;
  return right === 0 ? Number.NaN : left / right;
}

export function ShopCalculator() {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);

  function typeDigit(digit: string) {
    setDisplay((current) => {
      const base = fresh || current === "Error" ? "0" : current;
      if (digit === "." && base.includes(".")) return base;
      if (base.replace(".", "").replace("-", "").length >= 9) return base;
      if (base === "0" && digit !== ".") return digit;
      return base + digit;
    });
    setFresh(false);
  }

  function press(next: Op) {
    const value = Number(display);
    if (!Number.isFinite(value)) return;
    if (stored != null && op && !fresh) {
      const result = combine(stored, op, value);
      setStored(Number.isFinite(result) ? roundMoney(result) : null);
      setDisplay(show(result));
    } else {
      setStored(value);
    }
    setOp(next);
    setFresh(true);
  }

  function equals() {
    if (stored == null || !op) return;
    const result = combine(stored, op, Number(display));
    setDisplay(show(result));
    setStored(null);
    setOp(null);
    setFresh(true);
  }

  function clear() {
    setDisplay("0");
    setStored(null);
    setOp(null);
    setFresh(true);
  }

  function back() {
    setDisplay((current) => {
      if (fresh || current === "Error" || current.length <= 1 || (current.startsWith("-") && current.length <= 2)) return "0";
      return current.slice(0, -1);
    });
    setFresh(false);
  }

  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "⌫", "+"] as const;

  return (
    <section className="mx-auto w-full max-w-sm rounded-xl border border-line border-t-4 border-t-sign bg-card p-4">
      <h2 className="font-display text-xl leading-tight">Calculator</h2>
      <p className="mt-1 text-sm text-muted">For adding a bill. This does not save anything.</p>
      <p className="mt-4 truncate text-right font-display text-4xl tabular-nums leading-none" aria-live="polite">
        {op && fresh ? `${op} ` : ""}
        {display}
      </p>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === "⌫") back();
              else if (key === "+" || key === "−" || key === "×" || key === "÷") press(key);
              else typeDigit(key);
            }}
            className={cn(
              "h-14 rounded-xl text-xl font-semibold",
              key === "+" || key === "−" || key === "×" || key === "÷" ? "bg-sign" : "bg-wash",
            )}
          >
            {key}
          </button>
        ))}
        <button type="button" onClick={clear} className="h-14 rounded-xl bg-wash text-base font-semibold">
          Clear
        </button>
        <button type="button" onClick={equals} className="col-span-3 h-14 rounded-xl bg-ink text-xl font-semibold text-paper">
          =
        </button>
      </div>
    </section>
  );
}
