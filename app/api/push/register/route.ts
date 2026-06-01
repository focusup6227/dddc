import { NextResponse, type NextRequest } from "next/server";
import { getApiProfile, isFullStaffProfile } from "@/lib/api-auth";
import { registerStaffPushToken } from "@/lib/push.server";

// The staff app posts its Expo push token here after sign-in so the server can
// notify it. Staff-only; accepts the cookie session or a Supabase bearer token.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getApiProfile(req);
  if (!session || !isFullStaffProfile(session.profile)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = (body as { token?: unknown })?.token;
  const platform = (body as { platform?: unknown })?.platform;
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken")) {
    return NextResponse.json({ error: "Valid Expo token required" }, { status: 400 });
  }

  await registerStaffPushToken(
    session.userId,
    token,
    typeof platform === "string" ? platform : null,
  );
  return NextResponse.json({ ok: true });
}
