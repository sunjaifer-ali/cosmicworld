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
  sanitizeSupplier,
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
  supplier: string;
  onCategory: (category: PurchaseCategory) => void;
  onPayment: (payment: Payment) => void;
  onAmount: (amount: string) => void;
  onSupplier: (supplier: string) => void;
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

export function EntryForm(props: (SaleDraft | PurchaseDraft | ExpenseDraft) & { easy?: boolean }) {
  const queryClient = useQueryClient();
  const amountRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [shopName, setShopName] = useState(false);
  const easy = props.easy === true && props.mode !== "expense";
  const tight = easy && props.mode === "sale";
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
          data: {
            date: props.date,
            category: props.category,
            amount,
            payment: props.payment,
            supplier: props.supplier.trim() || undefined,
          },
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
      if (props.mode === "purchase") props.onSupplier("");
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
      className={cn("overflow-hidden rounded-xl border border-line border-t-4 border-t-sign bg-card", tight ? "p-3" : "p-4")}
      onSubmit={(event) => {
        event.preventDefault();
        setReceipt("");
        save.mutate();
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl leading-tight tracking-tight">{easy ? (props.mode === "sale" ? "Sale" : "Purchase") : `New ${verb}`}</h2>
        {easy && !showDate ? (
          <button type="button" onClick={() => setShowDate(true)} className="text-sm font-medium text-muted">
            Today
          </button>
        ) : null}
      </div>
      {easy && showDate ? (
        <input
          id="bill-date"
          type="date"
          aria-label="Date"
          value={props.date}
          onChange={(event) => {
            if (event.target.value) props.onDate(event.target.value);
          }}
          className="mt-2 h-11 w-full rounded-xl border border-line bg-wash px-3 text-base"
        />
      ) : null}

      <label className={cn("block", tight ? "mt-3" : "mt-4")} htmlFor="bill-amount">
        <span className="mb-1.5 block text-sm font-medium">{easy ? "How much?" : "Amount"}</span>
        <span className={cn("flex items-center gap-2 border border-line bg-wash px-4 focus-within:border-ink", tight ? "h-16 rounded-xl" : easy ? "h-20 rounded-2xl" : "h-16 rounded-xl")}>
          <span className={cn("font-display text-muted", tight ? "text-2xl" : "text-3xl")} aria-hidden="true">
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
            className={cn("h-full w-full bg-transparent font-display leading-none tabular-nums outline-none", tight ? "text-3xl" : easy ? "text-4xl" : "text-3xl")}
          />
        </span>
      </label>

      <fieldset className={tight ? "mt-3" : "mt-4"}>
        <legend className="mb-1.5 text-sm font-medium">
          {easy ? (props.mode === "sale" ? "What sold?" : "What did you buy?") : "Category"}
        </legend>
        <div className={cn("flex flex-wrap gap-2", easy && "grid grid-cols-2")} role="radiogroup" aria-label="Category">
          {categories.map((item) => {
            const selected = props.category === item.id;
            const name = easy && props.mode === "purchase" && item.id === "general" ? "Whole bill" : item.label;
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
                  tight ? "h-12 rounded-xl text-base" : easy ? "h-14 rounded-xl text-base" : "h-10 rounded-full px-3.5 text-sm",
                  "font-medium transition-colors duration-150",
                  selected ? "bg-sign text-ink shadow-sm" : "bg-wash text-ink",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {props.mode === "purchase" && (!easy || shopName || props.supplier) ? (
        <label className="mt-4 block" htmlFor="purchase-shop">
          <span className="mb-2 block text-sm font-medium">{easy ? "From which shop?" : "Supplier"}</span>
          <input
            id="purchase-shop"
            value={props.supplier}
            maxLength={40}
            placeholder="Leave empty if you do not know"
            autoComplete="off"
            onChange={(event) => {
              setError("");
              props.onSupplier(sanitizeSupplier(event.target.value));
            }}
            className="h-12 w-full rounded-xl border border-line bg-wash px-3 text-base outline-none"
          />
        </label>
      ) : props.mode === "purchase" && easy ? (
        <button type="button" onClick={() => setShopName(true)} className="mt-3 h-11 text-sm font-medium text-muted">
          Add shop name
        </button>
      ) : null}

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

      <div className={cn("items-end gap-2", tight ? "mt-3" : "mt-4", easy ? "block" : "grid grid-cols-[1fr_9.5rem]")}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{easy ? "Cash or GPay?" : props.mode === "sale" ? "Received as" : "Paid as"}</legend>
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
                    tight ? "h-12 rounded-xl text-base" : easy ? "h-14 rounded-xl text-base" : "h-11 rounded-full text-sm",
                    "font-medium transition-colors duration-150",
                    selected ? "bg-sign text-ink shadow-sm" : "bg-wash text-ink",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {easy ? null : (
        <label className="block" htmlFor="bill-date">
          <span className="mb-2 block text-sm font-medium">Date</span>
          <input
            id="bill-date"
            type="date"
            value={props.date}
            onChange={(event) => {
              if (event.target.value) props.onDate(event.target.value);
            }}
            className="h-11 w-full rounded-xl border border-line bg-wash px-3 text-base"
          />
        </label>
        )}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-wash px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : receipt ? (
        <p className="mt-4 rounded-lg bg-wash px-3 py-2 text-sm" role="status">
          {receipt}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={save.isPending}
        className={cn(
          "mt-3 w-full bg-ink font-semibold text-paper shadow-[0_8px_20px_rgba(74,39,64,0.18)] transition-opacity duration-150 disabled:opacity-50",
          tight ? "h-12 rounded-xl text-base" : easy ? "h-14 rounded-2xl text-lg" : "h-12 rounded-xl text-base",
        )}
      >
        {save.isPending ? "Saving…" : easy ? (props.mode === "sale" ? "Save sale" : "Save purchase") : `Save ${verb}`}
      </button>
    </form>
  );
}
