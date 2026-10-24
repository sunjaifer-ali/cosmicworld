import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { addExpense, addPurchase, addSale } from "@/lib/ledger.functions";
import {
  canonicalAmount,
  categoryLabel,
  errorText,
  EXPENSE_CATEGORIES,
  formatInr,
  PAYMENTS,
  paymentLabel,
  PURCHASE_CATEGORIES,
  SALE_CATEGORIES,
  sanitizeAmountInput,
  sanitizeRemark,
  type ExpenseCategory,
  type Payment,
  type PurchaseCategory,
  type SaleCategory,
} from "@/lib/ledger";
import { cn } from "@/lib/cn";

type SaleDraft = {
  mode: "sale";
  date: string;
  category: SaleCategory;
  payment: Payment;
  amount: string;
  onCategory: (category: SaleCategory) => void;
  onPayment: (payment: Payment) => void;
  onAmount: (amount: string) => void;
  onDate: (date: string) => void;
};

type PurchaseDraft = {
  mode: "purchase";
  date: string;
  category: PurchaseCategory;
  payment: Payment;
  amount: string;
  onCategory: (category: PurchaseCategory) => void;
  onPayment: (payment: Payment) => void;
  onAmount: (amount: string) => void;
  onDate: (date: string) => void;
};

type ExpenseDraft = {
  mode: "expense";
  date: string;
  category: ExpenseCategory;
  payment: Payment;
  amount: string;
  remark: string;
  onCategory: (category: ExpenseCategory) => void;
  onPayment: (payment: Payment) => void;
  onAmount: (amount: string) => void;
  onRemark: (remark: string) => void;
  onDate: (date: string) => void;
};

export function EntryForm(props: SaleDraft | PurchaseDraft | ExpenseDraft) {
  const queryClient = useQueryClient();
  const amountRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const categories =
    props.mode === "sale" ? SALE_CATEGORIES : props.mode === "purchase" ? PURCHASE_CATEGORIES : EXPENSE_CATEGORIES;
  const verb = props.mode === "sale" ? "sale" : props.mode === "purchase" ? "purchase" : "expense";
  const savedName = props.mode === "sale" ? "Sale" : props.mode === "purchase" ? "Purchase" : "Expense";

  useEffect(() => {
    amountRef.current?.focus();
  }, [props.mode]);

  const save = useMutation({
    mutationFn: async () => {
      const amount = canonicalAmount(props.amount);
      if (!props.date) throw new Error("Choose the bill date");
      if (!amount) throw new Error("Enter the amount, like 250 or 250.50");
      if (props.mode === "expense" && props.category === "other" && !props.remark.trim()) {
        throw new Error("Add a short remark for Other");
      }
      if (props.mode === "sale") {
        return addSale({
          data: { date: props.date, category: props.category, amount, payment: props.payment },
        });
      }
      if (props.mode === "purchase") {
        return addPurchase({
          data: { date: props.date, category: props.category, amount, payment: props.payment },
        });
      }
      return addExpense({
        data: {
          date: props.date,
          category: props.category,
          amount,
          payment: props.payment,
          remark: props.category === "other" ? props.remark.trim() : undefined,
        },
      });
    },
    onSuccess: async () => {
      const amount = canonicalAmount(props.amount);
      setReceipt(
        amount
          ? `${savedName} saved · ${formatInr(amount)} · ${categoryLabel(props.category)} · ${paymentLabel(props.payment)}`
          : `${savedName} saved`,
      );
      setError("");
      props.onAmount("");
      if (props.mode === "expense") props.onRemark("");
      await queryClient.invalidateQueries({ queryKey: ["day", props.date] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      amountRef.current?.focus();
    },
    onError: (cause) => {
      setReceipt("");
      setError(errorText(cause, "Could not save that entry. Try again."));
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
      <h2 className="font-display text-xl leading-tight tracking-tight">New {verb}</h2>

      <label className="mt-4 block" htmlFor="bill-amount">
        <span className="mb-2 block text-sm font-medium">Amount</span>
        <span className="flex h-14 items-center gap-2 rounded-sm border border-line bg-paper px-4 focus-within:border-ink">
          <span className="font-display text-2xl text-muted" aria-hidden="true">
            ₹
          </span>
          <input
            ref={amountRef}
            id="bill-amount"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="0"
            value={props.amount}
            onChange={(event) => {
              setError("");
              setReceipt("");
              props.onAmount(sanitizeAmountInput(event.target.value));
            }}
            className="h-full w-full bg-transparent text-2xl font-semibold leading-none tabular-nums outline-none"
          />
        </span>
      </label>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          {categories.map((item) => {
            const selected = props.category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setError("");
                  if (props.mode === "sale") props.onCategory(item.id as SaleCategory);
                  else if (props.mode === "purchase") props.onCategory(item.id as PurchaseCategory);
                  else props.onCategory(item.id as ExpenseCategory);
                }}
                className={cn(
                  "h-11 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
                  selected ? "bg-ink text-paper" : "bg-wash text-ink",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {props.mode === "expense" && props.category === "other" ? (
        <label className="mt-5 block" htmlFor="expense-remark">
          <span className="mb-2 block text-sm font-medium">Remark</span>
          <input
            id="expense-remark"
            value={props.remark}
            maxLength={80}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="What was this for?"
            onChange={(event) => {
              setError("");
              setReceipt("");
              props.onRemark(sanitizeRemark(event.target.value));
            }}
            className="h-12 w-full rounded-sm border border-line bg-paper px-3 text-base outline-none"
          />
        </label>
      ) : null}

      <div className="mt-4 grid grid-cols-[1fr_9.5rem] items-end gap-2">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{props.mode === "sale" ? "Received as" : "Paid as"}</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment">
            {PAYMENTS.map((item) => {
              const selected = props.payment === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setError("");
                    props.onPayment(item.id);
                  }}
                  className={cn(
                    "h-11 rounded-sm text-sm font-medium transition-colors duration-150",
                    selected ? "bg-ink text-paper" : "bg-wash text-ink",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block" htmlFor="bill-date">
          <span className="mb-2 block text-sm font-medium">Date</span>
          <input
            id="bill-date"
            type="date"
            value={props.date}
            onChange={(event) => {
              if (event.target.value) props.onDate(event.target.value);
            }}
            className="h-11 w-full rounded-sm border border-line bg-paper px-3 text-base"
          />
        </label>
      </div>

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
        {save.isPending ? `Saving ${verb}…` : `Save ${verb}`}
      </button>
    </form>
  );
}
