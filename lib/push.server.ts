import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Save (or refresh) a staff device's Expo push token. */
export async function registerStaffPushToken(
  userId: string,
  token: string,
  platform: string | null,
): Promise<void> {
  const svc = createServiceClient();
  await svc.from("staff_push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
}

/**
 * Push a notification to every registered staff device via the Expo Push API.
 * Best-effort: never throws into the calling flow — a failed push must not
 * break a booking, payment, or check-in.
 */
export async function sendStaffPush(args: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const svc = createServiceClient();
    const { data } = await svc.from("staff_push_tokens").select("token");
    const tokens = ((data ?? []) as { token: string }[])
      .map((r) => r.token)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"));
    if (tokens.length === 0) return;

    const messages = tokens.map((to) => ({
      to,
      title: args.title,
      body: args.body,
      data: args.data ?? {},
      sound: "default" as const,
    }));

    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
    }
  } catch (err) {
    console.error("sendStaffPush failed", err);
  }
}
