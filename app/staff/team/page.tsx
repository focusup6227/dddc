import Link from "next/link";
import { ChevronRight, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { requireFullStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { formatDate } from "@/lib/format";
import { StaffSubNav } from "@/components/StaffSubNav";
import { ToastNotifier } from "@/components/ToastNotifier";
import { changeUserRole, inviteJuniorStaff, resendInvite } from "./actions";

const SUBNAV = [
  { href: "/staff/settings", label: "General" },
  { href: "/staff/packages", label: "Packages" },
  { href: "/staff/coupons", label: "Coupons" },
  { href: "/staff/events", label: "Events" },
  { href: "/staff/team", label: "Team", active: true },
];

const TOASTS = [
  { param: "saved" },
  { param: "error", tone: "error" as const },
];

export const dynamic = "force-dynamic";

type Role = "customer" | "junior_staff" | "staff";

type TeamRow = Pick<
  Profile,
  "id" | "full_name" | "email" | "role" | "created_at"
> & {
  last_sign_in_at: string | null;
};

export default async function TeamPage() {
  const session = await requireFullStaff();
  const svc = createServiceClient();

  // Team list: staff + junior_staff.
  const { data: teamData } = await svc
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .in("role", ["staff", "junior_staff"])
    .order("role", { ascending: false })
    .order("full_name");
  const team = (teamData ?? []) as Pick<
    Profile,
    "id" | "full_name" | "email" | "role" | "created_at"
  >[];

  // Resolve last_sign_in_at via auth admin API (one call, then map by id).
  const authMap = new Map<string, string | null>();
  try {
    const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users ?? []) {
      authMap.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch {
    // If listUsers fails (rare), we just won't show last-sign-in.
  }

  const rows: TeamRow[] = team.map((p) => ({
    ...p,
    last_sign_in_at: authMap.get(p.id) ?? null,
  }));

  const seniors = rows.filter((r) => r.role === "staff");
  const juniors = rows.filter((r) => r.role === "junior_staff");

  return (
    <div className="space-y-8 animate-fade-up">
      <StaffSubNav items={SUBNAV} />
      <ToastNotifier toasts={TOASTS} />

      <header>
        <h1 className="font-display text-3xl font-bold text-ink-900">Team</h1>
        <p className="mt-1 text-sm text-ink-500">
          Invite shift workers, change roles, and manage the team.
        </p>
      </header>

      <section className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Invite junior staff
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Send an email invite. They&apos;ll set a password and land on
              their Today screen. If the email already has a customer account,
              we just promote it.
            </p>
          </div>
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:flex">
            <UserPlus size={18} />
          </span>
        </div>
        <form
          action={inviteJuniorStaff}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[16rem]">
            <label htmlFor="invite-email" className="label">
              Email
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="newhire@example.com"
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary">
            <Mail size={16} /> Send invite
          </button>
        </form>
      </section>

      <Section
        title="Senior staff"
        subtitle="Full access — settings, billing, incidents, customers."
        rows={seniors}
        currentUserId={session.userId}
      />
      <Section
        title="Junior staff"
        subtitle="Today, Schedule, Bookings (read-only), Dogs (read-only), Chores."
        rows={juniors}
        currentUserId={session.userId}
        emptyText="No junior staff yet — send an invite above."
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  rows,
  currentUserId,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: TeamRow[];
  currentUserId: string;
  emptyText?: string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-ink-900">
          {title}{" "}
          <span className="text-sm font-normal text-ink-500">
            ({rows.length})
          </span>
        </h2>
      </div>
      <p className="text-sm text-ink-500">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          {emptyText ?? "None on file."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white shadow-soft">
          {rows.map((r) => (
            <TeamRowItem
              key={r.id}
              row={r}
              isSelf={r.id === currentUserId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamRowItem({ row, isSelf }: { row: TeamRow; isSelf: boolean }) {
  const pending = row.last_sign_in_at == null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <Link
        href={`/staff/team/${row.id}`}
        className="group -mx-2 min-w-0 flex-1 rounded-lg px-2 py-1 transition-colors hover:bg-cream-50"
      >
        <p className="font-semibold text-ink-900">
          {row.full_name || row.email}
          {isSelf && (
            <span className="ml-2 align-middle pill-warm">you</span>
          )}
          {pending && (
            <span className="ml-2 align-middle pill-warn">invite pending</span>
          )}
          {row.role === "staff" && (
            <span className="ml-2 align-middle pill-success">
              <ShieldCheck size={12} /> Senior
            </span>
          )}
          <ChevronRight
            size={16}
            className="ml-1 inline-block align-middle text-ink-400 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        </p>
        <p className="text-sm text-ink-500">{row.email}</p>
        <p className="text-xs text-ink-400">
          Joined {formatDate(row.created_at)}
          {row.last_sign_in_at &&
            ` · Last seen ${formatDate(row.last_sign_in_at)}`}
        </p>
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        {pending && (
          <form action={resendInvite}>
            <input type="hidden" name="email" value={row.email} />
            <button type="submit" className="btn-secondary text-sm">
              Resend invite
            </button>
          </form>
        )}
        {!isSelf && (
          <form action={changeUserRole} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={row.id} />
            <select
              name="role"
              defaultValue={row.role}
              className="input !w-auto !py-1.5 !pl-3 !pr-8 text-sm"
            >
              <option value="staff">Senior</option>
              <option value="junior_staff">Junior</option>
              <option value="customer">Remove from team</option>
            </select>
            <button type="submit" className="btn-secondary text-sm">
              Save
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
