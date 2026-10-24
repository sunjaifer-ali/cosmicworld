import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { addBank } from "@/lib/ledger.functions";
import {
  BANK_DIRECTIONS,
  bankDueDate,
  canonicalAmount,
  canonicalInterest,
  errorText,
  formatInr,
  sanitizeAmountInput,
  toCents,
  type BankDirection,
} from "@/lib/ledger";
import { cn } from "@/lib/cn";

export function BankForm({
  date,
  direction,
  amount,
  interest,
  onDate,
  onDirection,
  onAmount,
  onInterest,
  compact = true,
}: {
  date: string;
  direction: BankDirection;
  amount: string;
  interest: string;
  onDate: (date: string) => void;
  onDirection: (direction: BankDirection) => void;
  onAmount: (amount: string) => void;
  onInterest: (interest: string) => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const amountRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");

  useEffect(() => {
    amountRef.current?.focus();
  }, [direction]);

  const save = useMutation({
    mutationFn: async () => {
      const savedAmount = canonicalAmount(amount);
      if (!date) throw new Error("Choose the date");
      if (!savedAmount) throw new Error("Enter the amount, like 250 or 250.50");
      const savedInterest = direction === "returned" ? canonicalInterest(interest) : "0.00";
      if (!savedInterest) throw new Error("Enter the interest, like 50 or 0");
      if (direction === "returned" && toCents(savedInterest) > toCents(savedAmount)) {
        throw new Error("Interest cannot be more than the money received");
      }
      return addBank({
        data: {
          date,
          direction,
          amount: savedAmount,
          interest: direction === "returned" ? savedInterest : undefined,
        },
      });
    },
    onSuccess: async () => {
      const savedAmount = canonicalAmount(amount);
      const due = direction === "given" ? bankDueDate(date) : "";
      setReceipt(
        savedAmount
          ? direction === "given"
            ? `Collection saved · ${formatInr(savedAmount)} · back around ${due}`
            : `Return saved · ${formatInr(savedAmount)}`
          : "Bank pay saved",
      );
      setError("");
      onAmount("");
      onInterest("");
      await queryClient.invalidateQueries({ queryKey: ["day", date] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      amountRef.current?.focus();
    },
    onError: (cause) => {
      setReceipt("");
      setError(errorText(cause, "Could not save that bank pay row. Try again."));
    },
  });

  return (
    <form
      className="rounded-xl border border-line bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setReceipt("");
        save.mutate();
      }}
    >
      <h2 className={cn("font-display leading-tight tracking-tight", compact ? "text-xl" : "text-2xl")}>Bank pay</h2>
      {compact ? null : (
        <p className="mt-1 text-sm text-pretty text-muted">
          Cash the agent takes for savings. About six months later the bank returns that money with a small interest.
          This is not a sale or an expense.
        </p>
      )}

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium">What happened</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bank pay">
          {BANK_DIRECTIONS.map((item) => {
            const selected = direction === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setError("");
                  setReceipt("");
                  onDirection(item.id);
                }}
                className={cn(
                  "h-11 rounded-sm px-2 text-sm font-medium transition-colors duration-150",
                  selected ? "bg-ink text-paper" : "bg-wash text-ink",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-5 block" htmlFor="bank-amount">
        <span className="mb-2 block text-sm font-medium">
          {direction === "given" ? "Cash given" : "Money received"}
        </span>
        <span className="flex h-16 items-center gap-2 rounded-sm border border-line bg-paper px-4 focus-within:border-ink">
          <span className="font-display text-2xl text-muted" aria-hidden="true">
            ₹
          </span>
          <input
            ref={amountRef}
            id="bank-amount"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="0"
            value={amount}
            onChange={(event) => {
              setError("");
              setReceipt("");
              onAmount(sanitizeAmountInput(event.target.value));
            }}
            className="h-full w-full bg-transparent text-2xl font-semibold leading-none tabular-nums outline-none"
          />
        </span>
      </label>

      {direction === "returned" ? (
        <label className="mt-5 block" htmlFor="bank-interest">
          <span className="mb-2 block text-sm font-medium">Interest included</span>
          <span className="flex h-12 items-center gap-2 rounded-sm border border-line bg-paper px-4 focus-within:border-ink">
            <span className="font-display text-xl text-muted" aria-hidden="true">
              ₹
            </span>
            <input
              id="bank-interest"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="0"
              value={interest}
              onChange={(event) => {
                setError("");
                setReceipt("");
                onInterest(sanitizeAmountInput(event.target.value));
              }}
              className="h-full w-full bg-transparent text-base font-semibold tabular-nums outline-none"
            />
          </span>
          <span className="mt-1 block text-sm text-faint">The rest of the amount is your savings coming back.</span>
        </label>
      ) : (
        <p className="mt-4 text-sm text-pretty text-muted">
          Back around {date ? bankDueDate(date) : "six months later"}.
        </p>
      )}

      <label className="mt-5 block" htmlFor="bank-date">
        <span className="mb-2 block text-sm font-medium">Date</span>
        <input
          id="bank-date"
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) onDate(event.target.value);
          }}
          className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
        />
      </label>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : receipt ? (
        <p className="mt-4 text-sm text-muted" role="status">
          {receipt}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={save.isPending}
        className="mt-4 h-12 w-full rounded-sm bg-ink text-base font-semibold text-paper transition-opacity duration-150 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : direction === "given" ? "Save collection" : "Save return"}
      </button>
    </form>
  );
}
