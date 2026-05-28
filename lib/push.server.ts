import "server-only";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/stripe";
import type { PushSubscription } from "@/lib/supabase/types";

declare global {
  var __webpushConfigured: boolean | undefined;
}

function configured(): boolean {
  if (global.__webpushConfigured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const subject =
    process.env.VAPID_SUBJECT ?? "mailto:noreply@dixondoggydaycare.com";
  webpush.setVapidDetails(subject, pub, priv);
  global.__webpushConfigured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Send a push to every endpoint a user has registered. Expired endpoints are
 * pruned on 404/410. Never throws — failures are logged and swallowed so the
 * caller's main flow isn't affected.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!configured()) {
    console.warn("[push] VAPID keys not set — skipping send:", payload.title);
    return { sent: 0, removed: 0 };
  }
  const svc = createServiceClient();
  const { data: subs } = await svc
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);
  const subscriptions = (subs ?? []) as PushSubscription[];
  if (subscriptions.length === 0) return { sent: 0, removed: 0 };

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? appUrl(),
    tag: payload.tag,
  });

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
          },
          data,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (err: unknown) {
        const status =
          typeof err === "object" && err && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (status === 404 || status === 410) {
          await svc.from("push_subscriptions").delete().eq("id", sub.id);
          removed++;
        } else {
          console.error("[push] send failed:", err);
        }
      }
    }),
  );
  return { sent, removed };
}

export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}
