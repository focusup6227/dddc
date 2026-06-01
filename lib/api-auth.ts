import "server-only";
import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Resolve the caller's profile for a JSON API route, accepting EITHER the
 * cookie session (web / WebView) OR an `Authorization: Bearer <supabase access
 * token>` (native app). Returns null when unauthenticated — callers send 401.
 */
export async function getApiProfile(
  req: NextRequest,
): Promise<{ userId: string; profile: Profile } | null> {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (!token) return null;
    const svc = createServiceClient();
    const {
      data: { user },
    } = await svc.auth.getUser(token);
    if (!user) return null;
    const { data: profile } = await svc
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();
    return profile ? { userId: user.id, profile } : null;
  }

  // Cookie session (signed-in web / WebView).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return profile ? { userId: user.id, profile } : null;
}

/** True for senior (full) staff — the role allowed to take payments. */
export function isFullStaffProfile(profile: Profile): boolean {
  return profile.role === "staff";
}
