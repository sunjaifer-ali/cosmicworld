import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { backupFileSchema, type BackupFile } from "@/lib/backup";
import { exportBackup, listAutoBackups, restoreAutoBackup, restoreBackup } from "@/lib/backup.functions";
import { cn } from "@/lib/cn";
import {
  normalizeUsername,
  passwordSchema,
  usernameSchema,
  writeCounterToken,
  type CounterPublic,
  type CounterRole,
} from "@/lib/counter";
import { changePassword, createAdmin, createStaff, listDoorNames, listStaff, removeStaff, setStaffPassword, signInCounter } from "@/lib/counter.functions";
import { errorText } from "@/lib/ledger";

type SignedIn = { token: string; account: CounterPublic };

export function BrandMark({ className = "size-16" }: { className?: string }) {
  return (
    <img src="/shop-mark.jpg" alt="" width={72} height={72} className={`${className} shrink-0 rounded-md bg-ink object-cover`} />
  );
}

export function AdminSetup({ onDone }: { onDone: (session: SignedIn) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const issue = fieldIssue(username, password);
      if (issue) throw new Error(issue);
      if (password !== confirm) throw new Error("Those passwords do not match");
      return createAdmin({ data: { username: username.trim(), password } });
    },
    onSuccess: (result) => {
      writeCounterToken(result.token);
      onDone(result);
    },
    onError: (cause) => setError(errorText(cause, "Could not save the admin login.")),
  });

  return (
    <GateFrame
      title="Set the admin login"
      lede="This is the first time the counter opens. Choose the admin username and password. Staff logins are added after you are in."
    >
      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          save.mutate();
        }}
      >
        <UsernameField value={username} onChange={setUsername} autoFocus />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least 6 characters."
        />
        <PasswordField
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={save.isPending}
          className="mt-5 h-12 w-full rounded-sm bg-ink text-base font-semibold text-paper disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save admin login"}
        </button>
      </form>
    </GateFrame>
  );
}

export function SignInDoors({ onDone }: { onDone: (session: SignedIn) => void }) {
  const names = useQuery({
    queryKey: ["door-names"],
    queryFn: () => listDoorNames(),
  });
  const [role, setRole] = useState<CounterRole>("staff");
  const [picked, setPicked] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const staff = names.data?.staff ?? [];
  const adminName = names.data?.admin ?? "";
  const username = role === "admin" ? adminName : staff.includes(picked) ? picked : (staff[0] ?? "");

  const signIn = useMutation({
    mutationFn: async () => {
      if (role === "staff" && staff.length === 0) {
        throw new Error("No staff login yet. The admin adds it from the Staff tab.");
      }
      const issue = fieldIssue(username, password);
      if (issue) throw new Error(issue);
      return signInCounter({ data: { username, password, role } });
    },
    onSuccess: (result) => {
      writeCounterToken(result.token);
      onDone(result);
    },
    onError: (cause) => setError(errorText(cause, "Could not sign in.")),
  });

  return (
    <GateFrame
      title="Sign in"
      lede={
        role === "admin"
          ? "The admin name stays. Enter the password to open the books."
          : staff.length > 1
            ? "Choose the staff name, then enter the password."
            : "The staff name stays. Enter the password."
      }
    >
      <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Which login">
        {(
          [
            ["staff", "Staff"],
            ["admin", "Admin"],
          ] as const
        ).map(([id, label]) => {
          const selected = role === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setRole(id);
                setPassword("");
                setError("");
              }}
              className={cn(
                "h-14 rounded-sm text-base font-semibold transition-colors duration-150",
                selected ? "bg-ink text-paper" : "bg-wash text-ink",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <form
        className="mt-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError("");
          signIn.mutate();
        }}
      >
        {names.isPending ? (
          <p className="text-sm text-muted">Loading names…</p>
        ) : names.isError ? (
          <div>
            <p className="text-sm text-danger" role="alert">
              {errorText(names.error, "Could not load the names.")}
            </p>
            <button
              type="button"
              onClick={() => void names.refetch()}
              className="mt-3 h-11 rounded-sm bg-wash px-4 text-sm font-medium"
            >
              Try again
            </button>
          </div>
        ) : role === "staff" && staff.length === 0 ? (
          <p className="text-sm text-pretty text-muted">
            No staff login yet. Sign in as admin and add one from the Staff tab.
          </p>
        ) : role === "staff" && staff.length > 1 ? (
          <StaffPicker names={staff} value={username} onChange={setPicked} />
        ) : (
          <StillName name={username} />
        )}
        {role === "admin" || staff.length > 0 ? (
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            autoFocus={!names.isPending}
          />
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {role === "admin" || staff.length > 0 ? (
          <button
            type="submit"
            disabled={signIn.isPending || names.isPending || !username}
            className="mt-5 h-12 w-full rounded-sm bg-ink text-base font-semibold text-paper disabled:opacity-50"
          >
            {signIn.isPending ? "Signing in…" : role === "admin" ? "Sign in as admin" : "Sign in as staff"}
          </button>
        ) : null}
      </form>
    </GateFrame>
  );
}

export function StaffDesk() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["staff"],
    queryFn: () => listStaff(),
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const issue = fieldIssue(username, password);
      if (issue) throw new Error(issue);
      return createStaff({ data: { username: username.trim(), password } });
    },
    onSuccess: async (result) => {
      setUsername("");
      setPassword("");
      setError("");
      setNotice(`Staff login saved for ${result.username}.`);
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (cause) => {
      setNotice("");
      setError(errorText(cause, "Could not add that staff login."));
    },
  });

  const remove = useMutation({
    mutationFn: (name: string) => removeStaff({ data: { username: name } }),
    onSuccess: async (result) => {
      setConfirm(null);
      setError("");
      setNotice(`${result.username} can no longer sign in.`);
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (cause) => setError(errorText(cause, "Could not remove that staff login.")),
  });

  const staff = query.data?.staff ?? [];

  return (
    <section className="mt-6">
      <h2 className="font-display text-2xl leading-tight tracking-tight">Staff logins</h2>
      <p className="mt-1 text-sm text-pretty text-muted">
        Each person at the counter gets a username and password. They can enter sales, purchases, expenses, and bank pay.
      </p>

      <form
        className="mt-5 rounded-xl border border-line bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          add.mutate();
        }}
      >
        <UsernameField value={username} onChange={setUsername} />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="Tell them this password. It is not shown again."
        />
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : notice ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {notice}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={add.isPending}
          className="mt-4 h-12 w-full rounded-sm bg-ink text-base font-semibold text-paper disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add staff login"}
        </button>
      </form>

      <div className="mt-4">
        {query.isPending ? (
          <div className="h-16 animate-pulse rounded-lg bg-wash motion-reduce:animate-none" />
        ) : query.isError ? (
          <div className="rounded-xl border border-line bg-card p-4">
            <p className="text-sm text-danger" role="alert">
              {errorText(query.error, "Could not load staff logins.")}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 h-11 rounded-sm bg-wash px-4 text-sm font-medium"
            >
              Try again
            </button>
          </div>
        ) : staff.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center">
            <p className="text-sm text-pretty text-muted">No staff logins yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {staff.map((person) => (
              <li key={person.username} className="px-4 py-3">
                {confirm === person.username ? (
                  <div>
                    <p className="text-sm">Remove {person.username}? They will be signed out.</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirm(null)}
                        className="h-11 flex-1 rounded-sm bg-wash text-sm font-medium"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(person.username)}
                        className="h-11 flex-1 rounded-sm bg-ink text-sm font-medium text-paper disabled:opacity-50"
                      >
                        {remove.isPending ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{person.username}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setNotice("");
                        setConfirm(person.username);
                      }}
                      className="h-11 shrink-0 rounded-sm px-3 text-sm font-medium text-muted"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <PasswordCard staff={staff.map((person) => person.username)} />
      <BackupCard />
    </section>
  );
}

function PasswordCard({ staff }: { staff: string[] }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [staffName, setStaffName] = useState("");
  const chosen = staff.includes(staffName) ? staffName : (staff[0] ?? "");
  const [staffNext, setStaffNext] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const own = useMutation({
    mutationFn: () => changePassword({ data: { current, next } }),
    onSuccess: (result) => {
      writeCounterToken(result.token);
      setCurrent("");
      setNext("");
      setError("");
      setNotice("Admin password changed. Other devices are signed out.");
    },
    onError: (cause) => {
      setNotice("");
      setError(errorText(cause, "Could not change the password."));
    },
  });
  const staffSave = useMutation({
    mutationFn: () => setStaffPassword({ data: { username: chosen, password: staffNext } }),
    onSuccess: (result) => {
      setStaffNext("");
      setError("");
      setNotice(`Password changed for ${result.username}. They must sign in again.`);
    },
    onError: (cause) => {
      setNotice("");
      setError(errorText(cause, "Could not change that password."));
    },
  });

  return (
    <div className="mt-4 space-y-4">
      <form
        className="rounded-xl border border-line bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          own.mutate();
        }}
      >
        <h3 className="font-display text-xl">Admin password</h3>
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <button type="submit" disabled={own.isPending} className="mt-4 h-12 w-full rounded-xl bg-ink font-semibold text-paper disabled:opacity-50">
          {own.isPending ? "Saving…" : "Change admin password"}
        </button>
      </form>
      {staff.length > 0 ? (
        <form
          className="rounded-xl border border-line bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            staffSave.mutate();
          }}
        >
          <h3 className="font-display text-xl">Staff password</h3>
          <label className="mt-3 block">
            <span className="mb-2 block text-sm font-medium">Staff</span>
            <select
              value={chosen}
              onChange={(event) => setStaffName(event.target.value)}
              className="h-12 w-full rounded-xl border border-line bg-paper px-3"
            >
              {staff.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <PasswordField label="New password" value={staffNext} onChange={setStaffNext} autoComplete="new-password" />
          <button type="submit" disabled={staffSave.isPending} className="mt-4 h-12 w-full rounded-xl bg-ink font-semibold text-paper disabled:opacity-50">
            {staffSave.isPending ? "Saving…" : "Change staff password"}
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
    </div>
  );
}

function dayTitle(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function BackupCard() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [autoDay, setAutoDay] = useState<string | null>(null);
  const copies = useQuery({
    queryKey: ["auto-backups"],
    queryFn: () => listAutoBackups(),
  });

  const restoreAuto = useMutation({
    mutationFn: (date: string) => restoreAutoBackup({ data: { date } }),
    onSuccess: async (result) => {
      setAutoDay(null);
      setError("");
      setNotice(`Books restored. ${result.sales} sales, ${result.purchases} purchases, ${result.expenses} expenses, ${result.bank} bank rows.`);
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      await queryClient.invalidateQueries({ queryKey: ["rates"] });
      await queryClient.invalidateQueries({ queryKey: ["auto-backups"] });
    },
    onError: (cause) => {
      setNotice("");
      setError(errorText(cause, "Could not restore that day."));
    },
  });

  const download = useMutation({
    mutationFn: () => exportBackup(),
    onSuccess: (file) => {
      const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Cosmic-World-backup-${file.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setError("");
      setNotice("Backup saved on this phone. Keep that file private.");
    },
    onError: (cause) => {
      setNotice("");
      setError(errorText(cause, "Could not make the backup."));
    },
  });

  const restore = useMutation({
    mutationFn: (file: BackupFile) => restoreBackup({ data: file }),
    onSuccess: async (result) => {
      setPending(null);
      setError("");
      setNotice(
        `Books replaced. ${result.sales} sales, ${result.purchases} purchases, ${result.expenses} expenses, ${result.bank} bank rows.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      await queryClient.invalidateQueries({ queryKey: ["rates"] });
      await queryClient.invalidateQueries({ queryKey: ["auto-backups"] });
    },
    onError: (cause) => {
      setNotice("");
      setError(errorText(cause, "Could not restore that backup."));
    },
  });

  return (
    <div className="mt-8 rounded-xl border border-line bg-card p-4">
      <h3 className="font-display text-xl leading-tight">Backup</h3>
      <p className="mt-1 text-sm text-pretty text-muted">
        A copy is saved in the database every day and kept for three days. Passwords are not included.
      </p>
      <div className="mt-3 space-y-2">
        {copies.isPending ? <p className="text-sm text-muted">Checking the saved days…</p> : null}
        {copies.isError ? (
          <p className="text-sm text-danger">{errorText(copies.error, "Could not load the saved days.")}</p>
        ) : null}
        {(copies.data?.days ?? []).map((copy) => (
          <div key={copy.date} className="flex items-center justify-between gap-3 rounded-lg bg-wash px-3 py-2">
            {autoDay === copy.date ? (
              <div className="flex w-full gap-2">
                <button type="button" onClick={() => setAutoDay(null)} className="h-11 flex-1 rounded-xl bg-card text-sm font-medium">
                  Keep current books
                </button>
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => {
                    setPending(null);
                    restoreAuto.mutate(copy.date);
                  }}
                  className="h-11 flex-1 rounded-xl bg-ink text-sm font-medium text-paper disabled:opacity-50"
                >
                  {restoreAuto.isPending ? "Restoring…" : "Restore this day"}
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-medium">{dayTitle(copy.date)}</p>
                  <p className="text-sm text-muted">
                    {copy.sales} sales · {copy.purchases} purchases · saved {copy.savedAt}
                  </p>
                </div>
                <button type="button" onClick={() => setAutoDay(copy.date)} className="h-11 shrink-0 rounded-xl bg-card px-3 text-sm font-medium">
                  Restore
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={download.isPending}
          onClick={() => download.mutate()}
          className="h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50"
        >
          {download.isPending ? "Preparing…" : "Download backup"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-11 rounded-sm bg-wash px-4 text-sm font-medium"
        >
          Restore a backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (!chosen) return;
            void chosen.text().then((text) => {
              try {
                const parsed = backupFileSchema.safeParse(JSON.parse(text));
                if (!parsed.success) throw new Error("bad file");
                setError("");
                setNotice("");
                setPending(parsed.data);
              } catch {
                setPending(null);
                setNotice("");
                setError("That file is not a Cosmic World backup.");
              }
            });
          }}
        />
      </div>
      {pending ? (
        <div className="mt-4">
          <p className="text-sm text-pretty">
            Replace the books with this file? {pending.sales.length} sales, {pending.purchases.length} purchases,{" "}
            {pending.expenses.length} expenses, {pending.bank.length} bank rows. Logins stay. This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="h-11 flex-1 rounded-sm bg-wash text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={restore.isPending}
              onClick={() => restore.mutate(pending)}
              className="h-11 flex-1 rounded-sm bg-ink text-sm font-medium text-paper disabled:opacity-50"
            >
              {restore.isPending ? "Replacing…" : "Replace the books"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : notice ? (
        <p className="mt-3 text-sm text-muted" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export function GateStatus({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <GateFrame title={title} lede={body}>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 h-12 w-full rounded-sm bg-ink text-base font-semibold text-paper"
        >
          {action}
        </button>
      ) : null}
    </GateFrame>
  );
}

function GateFrame({ title, lede, children }: { title: string; lede: string; children?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
        <div className="overflow-hidden rounded-xl border border-line border-t-4 border-t-sign bg-card px-5 py-6 text-center">
          <div className="flex flex-col items-center">
            <BrandMark className="size-16 ring-2 ring-sign" />
            <p className="mt-3 font-display text-2xl leading-none tracking-tight">Cosmic World</p>
            <p className="mt-1 text-xs font-semibold tracking-[0.18em] text-muted">FANCY & COSMETICS</p>
          </div>
          <h1 className="mt-5 font-display text-2xl leading-tight tracking-tight text-balance">{title}</h1>
          <p className="mt-1 text-sm text-pretty text-muted">{lede}</p>
          <div className="mt-4 text-left">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-pretty text-muted">
          Developed by Jaifer Ali M. For personal use only.
        </p>
      </main>
    </div>
  );
}

function StillName({ name }: { name: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Username</p>
      <p className="flex h-12 items-center rounded-sm border border-line bg-wash px-3 text-base">{name}</p>
    </div>
  );
}

function StaffPicker({
  names,
  value,
  onChange,
}: {
  names: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-medium">Staff</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-sm border border-line bg-card px-3 text-base"
      >
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function UsernameField({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-medium">Username</span>
      <input
        id={id}
        name="username"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="username"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-sm border border-line bg-card px-3 text-base outline-none"
      />
      <span className="mt-1 block text-sm text-faint">Letters and numbers. Saved in lower case.</span>
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <label className="mt-4 block" htmlFor={id}>
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <span className="flex h-12 items-center rounded-sm border border-line bg-card focus-within:border-ink">
        <input
          id={id}
          name="password"
          autoFocus={autoFocus}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full w-full bg-transparent px-3 text-base outline-none"
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
          className="grid h-11 w-11 shrink-0 place-items-center text-muted"
        >
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      </span>
      {hint ? <span className="mt-1 block text-sm text-faint">{hint}</span> : null}
    </label>
  );
}

function fieldIssue(username: string, password: string): string | null {
  const name = usernameSchema.safeParse(username);
  if (!name.success) return name.error.issues[0]?.message ?? "Check the username";
  if (!normalizeUsername(name.data)) return "Check the username";
  const pass = passwordSchema.safeParse(password);
  if (!pass.success) return pass.error.issues[0]?.message ?? "Check the password";
  return null;
}
