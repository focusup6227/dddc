import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/stripe";
import { sendPushToUser } from "@/lib/push.server";
import { sendWaitlistOpening } from "@/lib/email";
import { addDays } from "@/lib/format";
import type {
  ServiceKind,
  WaitlistEntry,
} from "@/lib/supabase/types";

/**
 * Notify the oldest pending waitlist entries for any date the (now-canceled)
 * booking covered. Picks one entry per (date, kind) so we don't oversell —
 * if a second entry should be notified, the next cancellation triggers it.
 */
export async function notifyWaitlistForOpening(args: {
  serviceDate: string;
  serviceEndDate: string;
  serviceKind: ServiceKind;
}) {
  const dates: string[] = [];
  let cur = args.serviceDate;
  while (cur < args.serviceEndDate) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  if (dates.length === 0) return { notified: 0 };

  const svc = createServiceClient();
  const { data: entriesData } = await svc
    .from("waitlist_entries")
    .select("*")
    .eq("service_kind", args.serviceKind)
    .eq("status", "pending")
    .in("service_date", dates)
    .order("created_at");
  const entries = (entriesData ?? []) as WaitlistEntry[];
  if (entries.length === 0) return { notified: 0 };

  const seen = new Set<string>();
  let notified = 0;
  for (const e of entries) {
    const key = `${e.service_kind}:${e.service_date}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { error } = await svc
      .from("waitlist_entries")
      .update({
        status: "notified",
        notified_at: new Date().toISOString(),
        // 12 hours to claim — after that the next cancellation can grab it.
        expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      })
      .eq("id", e.id);
    if (error) continue;

    const [{ data: profile }, { data: dog }] = await Promise.all([
      svc
        .from("profiles")
        .select("email, full_name")
        .eq("id", e.customer_id)
        .maybeSingle<{ email: string; full_name: string | null }>(),
      svc
        .from("dogs")
        .select("name")
        .eq("id", e.dog_id)
        .maybeSingle<{ name: string }>(),
    ]);
    if (profile?.email) {
      await sendWaitlistOpening({
        to: profile.email,
        customerName: profile.full_name ?? profile.email,
        dogName: dog?.name ?? "your dog",
        serviceDate: e.service_date,
        serviceKind: e.service_kind,
      });
    }
    await sendPushToUser(e.customer_id, {
      title: "A spot just opened!",
      body: `${dog?.name ?? "Your dog"} can book ${
        e.service_kind === "boarding" ? "boarding" : "daycare"
      } on ${e.service_date}. Tap to claim.`,
      url: `${appUrl()}/bookings?waitlist=${e.id}`,
      tag: `waitlist-${e.id}`,
    });
    notified++;
  }
  return { notified };
}
