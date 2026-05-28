import "server-only";
import { Resend } from "resend";
import { appUrl } from "@/lib/stripe";
import { formatDate, formatDateShort, formatMoney } from "@/lib/format";

declare global {
  var __resend: Resend | undefined;
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!global.__resend) global.__resend = new Resend(key);
  return global.__resend;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Dixon Doggy Day Care <noreply@dixondoggydaycare.com>";
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

async function send(args: SendArgs) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send:", args.subject);
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) console.error("[email] resend error:", error);
  } catch (err) {
    console.error("[email] send threw:", err);
  }
}

const BRAND = "Dixon Doggy Day Care";

function shell(title: string, body: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;margin:0;padding:24px;color:#1c1917">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:28px">
    <h1 style="font-size:18px;margin:0 0 4px;color:#a16207">${BRAND}</h1>
    <h2 style="font-size:22px;margin:0 0 16px;color:#1c1917">${title}</h2>
    ${body}
    <p style="margin-top:28px;font-size:12px;color:#78716c">
      Questions? Just reply to this email.
    </p>
  </div>
</body></html>`;
}

// --- Booking confirmation -------------------------------------------------

export async function sendBookingConfirmation(args: {
  to: string;
  customerName: string;
  dogName: string;
  dates: string[]; // ISO YYYY-MM-DD
  paidByPackageCount: number;
  dropInCount: number;
  dropInTotalCents: number;
}) {
  const { to, customerName, dogName, dates, paidByPackageCount, dropInCount, dropInTotalCents } =
    args;
  const dateList = dates.map((d) => `<li>${formatDateShort(d)}</li>`).join("");
  const body = `
    <p>Hi ${escape(customerName)},</p>
    <p>We've got <strong>${escape(dogName)}</strong> booked for:</p>
    <ul>${dateList}</ul>
    <p style="margin-top:16px">
      ${paidByPackageCount > 0 ? `Covered by package: <strong>${paidByPackageCount} day${paidByPackageCount === 1 ? "" : "s"}</strong><br>` : ""}
      ${dropInCount > 0 ? `Drop-in days: <strong>${dropInCount}</strong> (${formatMoney(dropInTotalCents)})<br>` : ""}
    </p>
    <p><a href="${appUrl()}/bookings" style="color:#a16207;text-decoration:underline">View your bookings</a></p>
  `;
  await send({
    to,
    subject: `Booking confirmed for ${dogName}`,
    html: shell("Booking confirmed", body),
  });
}

// --- Payment receipt ------------------------------------------------------

export async function sendPaymentReceipt(args: {
  to: string;
  customerName: string;
  description: string; // e.g., "10-day package" or "Drop-in for Rex × 2 days"
  amountCents: number;
  paidAt: Date;
}) {
  const { to, customerName, description, amountCents, paidAt } = args;
  const body = `
    <p>Hi ${escape(customerName)},</p>
    <p>Thanks — your payment was received.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr><td style="padding:6px 0;color:#78716c">Item</td><td style="padding:6px 0;text-align:right"><strong>${escape(description)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Amount</td><td style="padding:6px 0;text-align:right"><strong>${formatMoney(amountCents)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Date</td><td style="padding:6px 0;text-align:right">${formatDate(paidAt)}</td></tr>
    </table>
  `;
  await send({
    to,
    subject: `Payment received — ${formatMoney(amountCents)}`,
    html: shell("Payment received", body),
  });
}

// --- Waiver signed --------------------------------------------------------

export async function sendWaiverSignedReceipt(args: {
  to: string;
  customerName: string;
  signedFullName: string;
  signedAt: Date;
  ip: string | null;
  waiverTitle: string;
  waiverVersion: string;
}) {
  const { to, customerName, signedFullName, signedAt, ip, waiverTitle, waiverVersion } = args;
  const body = `
    <p>Hi ${escape(customerName)},</p>
    <p>This confirms you've signed our liability waiver. Please keep this for your records.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr><td style="padding:6px 0;color:#78716c">Waiver</td><td style="padding:6px 0;text-align:right">${escape(waiverTitle)} (v${escape(waiverVersion)})</td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Signed name</td><td style="padding:6px 0;text-align:right"><strong>${escape(signedFullName)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Signed at</td><td style="padding:6px 0;text-align:right">${formatDate(signedAt)}</td></tr>
      ${ip ? `<tr><td style="padding:6px 0;color:#78716c">IP</td><td style="padding:6px 0;text-align:right">${escape(ip)}</td></tr>` : ""}
    </table>
  `;
  await send({
    to,
    subject: "Waiver signed",
    html: shell("Waiver signed", body),
  });
}

// --- Package almost empty -------------------------------------------------

export async function sendPackageLowAlert(args: {
  to: string;
  customerName: string;
  packageName: string;
  daysRemaining: number;
}) {
  const { to, customerName, packageName, daysRemaining } = args;
  const body = `
    <p>Hi ${escape(customerName)},</p>
    <p>Your <strong>${escape(packageName)}</strong> has <strong>${daysRemaining} day${daysRemaining === 1 ? "" : "s"}</strong> left.</p>
    <p>Want to renew before your next visit?</p>
    <p><a href="${appUrl()}/packages" style="color:#a16207;text-decoration:underline">Buy another package</a></p>
  `;
  await send({
    to,
    subject: "Your package is almost empty",
    html: shell("Package running low", body),
  });
}

// --- Day-before reminder --------------------------------------------------

export async function sendBookingReminder(args: {
  to: string;
  customerName: string;
  dogNames: string[];
  serviceDate: string; // ISO YYYY-MM-DD
}) {
  const { to, customerName, dogNames, serviceDate } = args;
  const dogs = dogNames.length === 1 ? dogNames[0] : dogNames.join(", ");
  const body = `
    <p>Hi ${escape(customerName)},</p>
    <p>Quick reminder: <strong>${escape(dogs)}</strong> ${dogNames.length === 1 ? "is" : "are"} booked with us tomorrow, ${formatDateShort(serviceDate)}.</p>
    <p>See you then!</p>
    <p><a href="${appUrl()}/bookings" style="color:#a16207;text-decoration:underline">View booking</a></p>
  `;
  await send({
    to,
    subject: `Reminder: day care tomorrow (${formatDateShort(serviceDate)})`,
    html: shell("See you tomorrow", body),
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
