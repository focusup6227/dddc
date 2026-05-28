"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";

type Props = {
  vapidPublicKey: string | null;
};

type SubState = "loading" | "unsupported" | "off" | "on";

export function PushToggle({ vapidPublicKey }: Props) {
  const [state, setState] = useState<SubState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !vapidPublicKey
    ) {
      setState("unsupported");
      return;
    }
    (async () => {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications were blocked. Enable them in your browser settings.");
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("on");
      toast.success("Notifications enabled.");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Notifications turned off.");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-ink-500">Checking notification support…</p>;
  }
  if (state === "unsupported") {
    return (
      <p className="text-sm text-ink-500">
        Push notifications aren&apos;t available on this device or browser.
        {!vapidPublicKey && " (Site admin: set NEXT_PUBLIC_VAPID_PUBLIC_KEY)"}
      </p>
    );
  }
  if (state === "on") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-700">
          You&apos;ll get a notification when we have updates about your dog.
        </p>
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          <BellOff size={14} /> Turn off
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-ink-700">
        Get a push when your dog is ready for pickup or a report card is up.
      </p>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        <Bell size={14} /> Enable
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}
