import { BadgeIndianRupee, BookOpen, FileText, Landmark, Package, Receipt, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BankForm } from "@/components/bank-form";
import { BillForm } from "@/components/bill-form";
import { BooksView } from "@/components/books-view";
import { AdminSetup, BrandMark, GateStatus, SignInDoors, StaffDesk } from "@/components/counter-gate";
import { DayLedger } from "@/components/day-ledger";
import { EntryForm } from "@/components/entry-form";
import { cn } from "@/lib/cn";
import { writeCounterToken, type CounterPublic, type CounterState } from "@/lib/counter";
import { getCounterState, signOutCounter } from "@/lib/counter.functions";
import {
  longDate,
  todayISO,
  errorText,
  type BankDirection,
  type ExpenseCategory,
  type Grain,
  type Payment,
  type PurchaseCategory,
  type SaleCategory,
} from "@/lib/ledger";

type Tab = "sale" | "purchase" | "expense" | "bank" | "bill" | "books" | "staff";

const TABS: { id: Tab; label: string; icon: typeof BookOpen; admin?: boolean }[] = [
  { id: "sale", label: "Sale", icon: BadgeIndianRupee },
  { id: "purchase", label: "Purchase", icon: Package },
  { id: "expense", label: "Expense", icon: Receipt },
  { id: "bank", label: "Bank", icon: Landmark },
  { id: "bill", label: "Bill", icon: FileText },
  { id: "books", label: "Books", icon: BookOpen, admin: true },
  { id: "staff", label: "Staff", icon: Users, admin: true },
];

type Draft = {
  saleCategory: SaleCategory;
  salePayment: Payment;
  saleAmount: string;
  purchaseCategory: PurchaseCategory;
  purchasePayment: Payment;
  purchaseAmount: string;
  expenseCategory: ExpenseCategory;
  expensePayment: Payment;
  expenseAmount: string;
  expenseRemark: string;
  bankDirection: BankDirection;
  bankAmount: string;
  bankInterest: string;
};

const INITIAL_DRAFT: Draft = {
  saleCategory: "cosmetics",
  salePayment: "cash",
  saleAmount: "",
  purchaseCategory: "general",
  purchasePayment: "cash",
  purchaseAmount: "",
  expenseCategory: "rent",
  expensePayment: "cash",
  expenseAmount: "",
  expenseRemark: "",
  bankDirection: "given",
  bankAmount: "",
  bankInterest: "",
};

export function CosmicWorldApp() {
  const queryClient = useQueryClient();
  const gate = useQuery({
    queryKey: ["counter"],
    queryFn: () => getCounterState(),
  });

  function remember(session: { token: string; account: CounterPublic }) {
    writeCounterToken(session.token);
    queryClient.setQueryData<CounterState>(["counter"], {
      needsAdmin: false,
      account: session.account,
    });
  }

  if (gate.isPending) {
    return <GateStatus title="Opening the counter" body="Checking who is signed in." />;
  }

  if (gate.isError) {
    return (
      <GateStatus
        title="The counter did not open"
        body={errorText(gate.error, "Could not reach the counter. Try again.")}
        action="Try again"
        onAction={() => void gate.refetch()}
      />
    );
  }

  if (gate.data.needsAdmin) {
    return <AdminSetup onDone={remember} />;
  }

  if (!gate.data.account) {
    return <SignInDoors onDone={remember} />;
  }

  return <Desk account={gate.data.account} />;
}

function Desk({ account }: { account: CounterPublic }) {
  const queryClient = useQueryClient();
  const [today, setToday] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState<string | null>(null);
  const [bookAnchor, setBookAnchor] = useState<string | null>(null);
  const [grain, setGrain] = useState<Grain>("month");
  const [tab, setTab] = useState<Tab>("sale");
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [signOutError, setSignOutError] = useState("");
  const admin = account.role === "admin";
  const tabs = TABS.filter((item) => admin || !item.admin);

  useEffect(() => {
    const iso = todayISO();
    setToday(iso);
    setWorkDate(iso);
    setBookAnchor(iso);
  }, []);

  const signOut = useMutation({
    mutationFn: () => signOutCounter(),
    onSuccess: () => {
      writeCounterToken(null);
      queryClient.setQueryData<CounterState>(["counter"], { needsAdmin: false, account: null });
    },
    onError: (cause) => setSignOutError(errorText(cause, "Could not sign out. Try again.")),
  });

  function goHome() {
    setTab("sale");
    if (today) {
      setWorkDate(today);
      setBookAnchor(today);
    }
    setGrain("month");
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-5 text-center sm:px-6">
          <button type="button" onClick={goHome} className="flex flex-col items-center gap-2" aria-label="Home">
            <BrandMark />
            <span>
              <span className="block font-display text-3xl leading-none tracking-tight text-paper">Cosmic World</span>
              <span className="mt-1.5 block text-sm font-semibold tracking-[0.18em] text-sign">FANCY & COSMETICS</span>
            </span>
          </button>
          <div className="no-print mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            {today ? <p className="text-sm font-medium text-paper">{longDate(today)}</p> : null}
            <p className="max-w-48 truncate text-sm font-medium text-paper">
              {admin ? "Admin" : "Staff"} · {account.username}
            </p>
            <button
              type="button"
              disabled={signOut.isPending}
              onClick={() => {
                setSignOutError("");
                signOut.mutate();
              }}
              className="h-11 rounded-sm bg-paper px-3 text-sm font-medium text-ink disabled:opacity-50"
            >
              {signOut.isPending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
        <div className="h-1.5 bg-sign" />
      </header>
      <div className="app-pad mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
        {signOutError ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {signOutError}
          </p>
        ) : null}

        <div className="no-print mt-5 hidden lg:block">
          <TabSwitch tab={tab} tabs={tabs} onTab={setTab} variant="track" />
        </div>

        {!today || !workDate || !bookAnchor ? (
          <p className="mt-8 text-sm text-muted">Loading the counter book…</p>
        ) : tab === "books" && admin ? (
          <div className="mt-6">
            <BooksView
              anchor={bookAnchor}
              grain={grain}
              today={today}
              onAnchor={setBookAnchor}
              onGrain={setGrain}
              onEnterDay={(date) => {
                setWorkDate(date);
                setTab("sale");
              }}
            />
          </div>
        ) : tab === "staff" && admin ? (
          <StaffDesk />
        ) : tab === "bill" ? (
          <div className="mt-6">
            <BillForm today={today} />
          </div>
        ) : (
          <div className="app-grid mt-6">
            {tab === "bank" ? (
              <BankForm
                date={workDate}
                direction={draft.bankDirection}
                amount={draft.bankAmount}
                interest={draft.bankInterest}
                onDate={setWorkDate}
                onDirection={(bankDirection) => setDraft((current) => ({ ...current, bankDirection }))}
                onAmount={(bankAmount) => setDraft((current) => ({ ...current, bankAmount }))}
                onInterest={(bankInterest) => setDraft((current) => ({ ...current, bankInterest }))}
              />
            ) : tab === "expense" ? (
              <EntryForm
                mode="expense"
                date={workDate}
                category={draft.expenseCategory}
                payment={draft.expensePayment}
                amount={draft.expenseAmount}
                remark={draft.expenseRemark}
                onDate={setWorkDate}
                onCategory={(expenseCategory) => setDraft((current) => ({ ...current, expenseCategory }))}
                onPayment={(expensePayment) => setDraft((current) => ({ ...current, expensePayment }))}
                onAmount={(expenseAmount) => setDraft((current) => ({ ...current, expenseAmount }))}
                onRemark={(expenseRemark) => setDraft((current) => ({ ...current, expenseRemark }))}
              />
            ) : tab === "purchase" ? (
              <EntryForm
                mode="purchase"
                date={workDate}
                category={draft.purchaseCategory}
                payment={draft.purchasePayment}
                amount={draft.purchaseAmount}
                onDate={setWorkDate}
                onCategory={(purchaseCategory) => setDraft((current) => ({ ...current, purchaseCategory }))}
                onPayment={(purchasePayment) => setDraft((current) => ({ ...current, purchasePayment }))}
                onAmount={(purchaseAmount) => setDraft((current) => ({ ...current, purchaseAmount }))}
              />
            ) : (
              <EntryForm
                mode="sale"
                date={workDate}
                category={draft.saleCategory}
                payment={draft.salePayment}
                amount={draft.saleAmount}
                onDate={setWorkDate}
                onCategory={(saleCategory) => setDraft((current) => ({ ...current, saleCategory }))}
                onPayment={(salePayment) => setDraft((current) => ({ ...current, salePayment }))}
                onAmount={(saleAmount) => setDraft((current) => ({ ...current, saleAmount }))}
              />
            )}
            <DayLedger
              date={workDate}
              mode={tab === "bank" ? "bank" : tab === "expense" ? "expense" : tab === "purchase" ? "purchase" : "sale"}
              today={today}
              canRemove={admin}
              showProfit={admin}
              compact={!admin}
            />
          </div>
        )}
      </div>

      <nav className="dock no-print lg:hidden" aria-label="Sections">
        <TabSwitch tab={tab} tabs={tabs} onTab={setTab} variant="dock" />
      </nav>
    </div>
  );
}

function TabSwitch({
  tab,
  tabs,
  onTab,
  variant,
}: {
  tab: Tab;
  tabs: { id: Tab; label: string; icon: typeof BookOpen }[];
  onTab: (tab: Tab) => void;
  variant: "track" | "dock";
}) {
  return (
    <div
      className={cn(
        variant === "track" && "grid gap-1 rounded-md bg-wash p-1",
        variant === "track" &&
          (tabs.length >= 7
            ? "grid-cols-7"
            : tabs.length === 6
              ? "grid-cols-6"
              : tabs.length === 5
                ? "grid-cols-5"
                : tabs.length === 4
                  ? "grid-cols-4"
                  : tabs.length === 3
                    ? "grid-cols-3"
                    : "grid-cols-2"),
        variant === "dock" && "flex",
      )}
    >
      {tabs.map((item) => {
        const active = tab === item.id;
        const Icon = item.icon;
        if (variant === "dock") {
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onTab(item.id)}
              className={cn(
                "flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-sm text-xs font-medium",
                active ? "text-ink" : "text-faint",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              {item.label}
            </button>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onTab(item.id)}
            className={cn(
              "h-11 rounded-sm text-sm font-medium transition-colors duration-150",
              active ? "bg-ink text-paper" : "text-muted",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
