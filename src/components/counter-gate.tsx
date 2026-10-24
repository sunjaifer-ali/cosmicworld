import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { backupFileSchema, type BackupFile } from "@/lib/backup";
import { exportBackup, restoreBackup } from "@/lib/backup.functions";
import { cn } from "@/lib/cn";
import {
  normalizeUsername,
  passwordSchema,
  usernameSchema,
  writeCounterToken,
  type CounterPublic,
  type CounterRole,
} from "@/lib/counter";
import { createAdmin, createStaff, listDoorNames, listStaff, removeStaff, signInCounter } from "@/lib/counter.functions";
import { errorText } from "@/lib/ledger";

type SignedIn = { token: string; account: CounterPublic };

export function BrandMark() {
  return (
    <img src="/shop-mark.jpg" alt="" width={72} height={72} className="size-16 shrink-0 rounded-lg bg-ink" />
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
      <BackupCard />
    </section>
  );
}

function BackupCard() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<BackupFile | null>(null);

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
        Download a copy of the books. Passwords are not in the file. Keep it private, in case this phone or the
        database is lost.
      </p>
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
      <main className="mx-auto w-full max-w-md px-4 pt-5 pb-16">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <p className="mt-2 font-display text-2xl leading-none tracking-tight">Cosmic World</p>
          <p className="mt-1 text-sm font-semibold tracking-[0.18em] text-muted">FANCY & COSMETICS</p>
        </div>
        <h1 className="mt-5 text-center font-display text-2xl leading-tight tracking-tight text-balance">{title}</h1>
        <p className="mt-1 text-center text-sm text-pretty text-muted">{lede}</p>
        {children}
        <p className="mt-10 text-center text-sm text-pretty text-muted">
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
