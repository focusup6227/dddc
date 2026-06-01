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
  return (
    process.env.EMAIL_FROM ??
    "Dixon Doggy Day Care and Boarding <noreply@dixondoggydaycare.com>"
  );
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

// ---------------------------------------------------------------------------
// Design tokens — kept in one place so every template stays consistent.
// All colors are hex (not Tailwind classes) because email clients don't run CSS.
// ---------------------------------------------------------------------------

const BRAND = "Dixon Doggy Day Care and Boarding";
const COLOR = {
  brand: "#ea580c",       // brand-600
  brandDark: "#c2410c",   // brand-700
  brandSoft: "#fff7ed",   // brand-50
  bg: "#fafaf9",          // stone-50
  card: "#ffffff",
  border: "#e7e5e4",      // stone-200
  borderSoft: "#f5f5f4",  // stone-100
  text: "#1c1917",        // stone-900
  textMuted: "#57534e",   // stone-600
  textFaint: "#a8a29e",   // stone-400
} as const;
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function shell(opts: {
  preheader: string;
  heading: string;
  intro?: string;
  body: string;
}): string {
  const { preheader, heading, intro, body } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};color:${COLOR.text};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escape(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:14px;overflow:hidden;">
          <!-- Brand header band -->
          <tr>
            <td style="background:${COLOR.brand};padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${appUrl()}/logo.jpg" alt="${escape(BRAND)}" width="44" height="44" style="display:block;border:0;border-radius:50%;background:#fff;">
                  </td>
                  <td style="vertical-align:middle;padding-left:14px;">
                    <div style="font-family:${FONT};font-size:15px;font-weight:600;color:#fff;letter-spacing:0.2px;line-height:1.2;">Dixon Doggy</div>
                    <div style="font-family:${FONT};font-size:12px;color:#ffedd5;line-height:1.2;margin-top:2px;">Day Care &amp; Boarding</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 12px;">
              <h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;color:${COLOR.text};">${escape(heading)}</h1>
              ${intro ? `<p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">${intro}</p>` : ""}
              ${body}
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:24px 32px 0;">
              <div style="height:1px;background:${COLOR.borderSoft};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px 28px;font-family:${FONT};font-size:12px;line-height:1.55;color:${COLOR.textFaint};">
              <div style="color:${COLOR.textMuted};font-weight:600;margin-bottom:4px;">${escape(BRAND)}</div>
              <div>Questions? Just reply to this email — a real human will read it.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
      <tr>
        <td style="border-radius:8px;background:${COLOR.brand};">
          <a href="${href}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escape(label)}</a>
        </td>
      </tr>
    </table>`;
}

function detailCard(rows: Array<{ label: string; value: string }>): string {
  const tr = rows
    .map(
      (r, i) => `
      <tr>
        <td style="padding:10px 14px;font-family:${FONT};font-size:13px;color:${COLOR.textMuted};${i === 0 ? "" : `border-top:1px solid ${COLOR.borderSoft};`}">${escape(r.label)}</td>
        <td align="right" style="padding:10px 14px;font-family:${FONT};font-size:14px;font-weight:600;color:${COLOR.text};${i === 0 ? "" : `border-top:1px solid ${COLOR.borderSoft};`}">${r.value}</td>
      </tr>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;background:${COLOR.brandSoft};border:1px solid ${COLOR.border};border-radius:10px;">
      ${tr}
    </table>`;
}

function dateChips(dates: string[]): string {
  // Renders each date as a soft pill — wraps naturally and reads better than a bulleted list.
  const cells = dates
    .map(
      (d) => `
      <td style="padding:4px 4px 4px 0;">
        <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:${COLOR.brandSoft};border:1px solid ${COLOR.border};font-family:${FONT};font-size:13px;font-weight:600;color:${COLOR.brandDark};">${escape(formatDateShort(d))}</div>
      </td>`,
    )
    .join("");
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
      <tr>${cells}</tr>
    </table>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

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

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: "Dog", value: escape(dogName) },
    { label: "Days booked", value: String(dates.length) },
  ];
  if (paidByPackageCount > 0) {
    summaryRows.push({
      label: "Covered by package",
      value: `${paidByPackageCount} day${paidByPackageCount === 1 ? "" : "s"}`,
    });
  }
  if (dropInCount > 0) {
    summaryRows.push({
      label: `Drop-in (${dropInCount} day${dropInCount === 1 ? "" : "s"})`,
      value: formatMoney(dropInTotalCents),
    });
  }

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">We've got <strong style="color:${COLOR.text};">${escape(dogName)}</strong> on the schedule for:</p>
    ${dateChips(dates)}
    ${detailCard(summaryRows)}
    ${button(`${appUrl()}/bookings`, "View your bookings")}
    <p style="margin:14px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${COLOR.textMuted};">Drop-off is anytime after we open. Wagging tails await. 🐾</p>
  `;

  await send({
    to,
    subject: `Booking confirmed for ${dogName}`,
    html: shell({
      preheader: `${dogName} is booked for ${dates.length} day${dates.length === 1 ? "" : "s"}.`,
      heading: "Booking confirmed",
      body,
    }),
  });
}

// --- Payment receipt ------------------------------------------------------

export async function sendPaymentReceipt(args: {
  to: string;
  customerName: string;
  description: string;
  amountCents: number;
  paidAt: Date;
}) {
  const { to, customerName, description, amountCents, paidAt } = args;

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">Thanks — your payment came through. Here's a receipt for your records.</p>
    ${detailCard([
      { label: "Item", value: escape(description) },
      { label: "Amount", value: formatMoney(amountCents) },
      { label: "Paid on", value: escape(formatDate(paidAt)) },
    ])}
    ${button(`${appUrl()}/bookings`, "View your account")}
  `;

  await send({
    to,
    subject: `Payment received — ${formatMoney(amountCents)}`,
    html: shell({
      preheader: `Receipt for ${formatMoney(amountCents)} — ${description}`,
      heading: "Payment received",
      body,
    }),
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

  const rows: Array<{ label: string; value: string }> = [
    { label: "Waiver", value: `${escape(waiverTitle)} (v${escape(waiverVersion)})` },
    { label: "Signed name", value: escape(signedFullName) },
    { label: "Signed on", value: escape(formatDate(signedAt)) },
  ];
  if (ip) rows.push({ label: "IP address", value: escape(ip) });

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">This confirms you've signed our liability waiver. Keep this email for your records — you won't need to sign again.</p>
    ${detailCard(rows)}
  `;

  await send({
    to,
    subject: "Waiver signed",
    html: shell({
      preheader: `Confirmation that you've signed ${waiverTitle} (v${waiverVersion}).`,
      heading: "Waiver signed",
      body,
    }),
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
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">Just a heads-up: your <strong style="color:${COLOR.text};">${escape(packageName)}</strong> is running low.</p>
    ${detailCard([
      { label: "Package", value: escape(packageName) },
      { label: "Days remaining", value: `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}` },
    ])}
    <p style="margin:16px 0 4px;font-family:${FONT};font-size:15px;line-height:1.55;color:${COLOR.textMuted};">Want to top up before your next visit?</p>
    ${button(`${appUrl()}/packages`, "Buy another package")}
  `;

  await send({
    to,
    subject: "Your package is almost empty",
    html: shell({
      preheader: `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left on your ${packageName}.`,
      heading: "Package running low",
      body,
    }),
  });
}

// --- Booking cancellation -------------------------------------------------

export async function sendBookingCancellation(args: {
  to: string;
  customerName: string;
  dogName: string;
  serviceDate: string;
  serviceEndDate: string;
  serviceKind: "daycare" | "boarding";
  paymentKind: "package" | "drop_in";
  refundAmountCents: number;
  packageDayRestored: boolean;
  refundFraction: 1 | 0.5;
  actorRole: "customer" | "staff";
}) {
  const {
    to,
    customerName,
    dogName,
    serviceDate,
    serviceEndDate,
    serviceKind,
    paymentKind,
    refundAmountCents,
    packageDayRestored,
    refundFraction,
    actorRole,
  } = args;

  const dateLabel =
    serviceKind === "boarding"
      ? `${formatDateShort(serviceDate)} → ${formatDateShort(serviceEndDate)}`
      : formatDateShort(serviceDate);

  let refundLine: { label: string; value: string };
  if (paymentKind === "package") {
    refundLine = {
      label: "Package day",
      value: packageDayRestored ? "Restored" : "Forfeited (within 24h)",
    };
  } else if (refundAmountCents > 0) {
    refundLine = {
      label: refundFraction === 1 ? "Refund (100%)" : "Refund (50%, within 24h)",
      value: formatMoney(refundAmountCents),
    };
  } else {
    refundLine = { label: "Refund", value: "None" };
  }

  const explainer =
    actorRole === "staff"
      ? "We canceled this booking on our end, so you've been refunded in full."
      : refundFraction === 1
        ? "Because the cancellation came in more than 24 hours before the booking, you get a full refund."
        : "Because the cancellation came in within 24 hours of the booking, the refund is 50% per our policy.";

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">Your booking for <strong style="color:${COLOR.text};">${escape(dogName)}</strong> has been canceled.</p>
    ${detailCard([
      { label: serviceKind === "boarding" ? "Stay" : "Day", value: escape(dateLabel) },
      { label: "Dog", value: escape(dogName) },
      refundLine,
    ])}
    <p style="margin:14px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${COLOR.textMuted};">${explainer}</p>
    ${button(`${appUrl()}/bookings`, "View your bookings")}
  `;

  await send({
    to,
    subject: `Booking canceled — ${dogName} (${dateLabel})`,
    html: shell({
      preheader: `Cancellation confirmed for ${dogName} on ${dateLabel}.`,
      heading: "Booking canceled",
      body,
    }),
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
  const verb = dogNames.length === 1 ? "is" : "are";

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">Quick reminder — <strong style="color:${COLOR.text};">${escape(dogs)}</strong> ${verb} booked with us tomorrow.</p>
    ${detailCard([
      { label: "Dog" + (dogNames.length === 1 ? "" : "s"), value: escape(dogs) },
      { label: "Date", value: escape(formatDateShort(serviceDate)) },
    ])}
    ${button(`${appUrl()}/bookings`, "View booking")}
    <p style="margin:14px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${COLOR.textMuted};">See you then! 🐶</p>
  `;

  await send({
    to,
    subject: `Reminder: day care tomorrow (${formatDateShort(serviceDate)})`,
    html: shell({
      preheader: `${dogs} ${verb} booked tomorrow, ${formatDateShort(serviceDate)}.`,
      heading: "See you tomorrow",
      body,
    }),
  });
}

// --- Staff invite ---------------------------------------------------------

export async function sendStaffInvite(args: {
  to: string;
  inviterName: string;
  actionUrl: string;
  resend?: boolean;
}) {
  const { to, inviterName, actionUrl, resend } = args;

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi there,</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">
      <strong style="color:${COLOR.text};">${escape(inviterName)}</strong> ${resend ? "re-sent your invite" : "invited you"} to join the
      <strong style="color:${COLOR.text};">${escape(BRAND)}</strong> team as a junior staff member.
    </p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">
      You&rsquo;ll be able to check dogs in and out, complete chores, and see the day&rsquo;s schedule. Click below to set a password and finish setting up your account.
    </p>
    ${button(actionUrl, "Accept invite & set password")}
    <p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:1.55;color:${COLOR.textFaint};">
      This link expires in 24 hours. If you weren&rsquo;t expecting this, you can safely ignore the email.
    </p>
  `;

  await send({
    to,
    subject: `${inviterName} invited you to join Dixon Doggy Day Care`,
    html: shell({
      preheader: `Set up your junior-staff account at ${BRAND}.`,
      heading: "You're invited",
      body,
    }),
  });
}

// --- Customer welcome (staff-created account) -----------------------------

export async function sendCustomerWelcome(args: {
  to: string;
  customerName: string;
  actionUrl: string;
  resend?: boolean;
}) {
  const { to, customerName, actionUrl, resend } = args;
  const greeting = customerName?.trim() ? `Hi ${escape(customerName)},` : "Hi there,";

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">${greeting}</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">
      ${resend ? "Here&rsquo;s a fresh link to finish setting up your account at" : "We&rsquo;ve set up an account for you at"} <strong style="color:${COLOR.text};">${escape(BRAND)}</strong>.
      Set a password below and you&rsquo;ll be able to manage your dogs, book day care and boarding, and view your visits online.
    </p>
    ${button(actionUrl, "Set your password")}
    <p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:1.55;color:${COLOR.textFaint};">
      This link expires in 24 hours. If you weren&rsquo;t expecting this, you can safely ignore the email.
    </p>
  `;

  await send({
    to,
    subject: resend ? `Your ${BRAND} account link` : `Welcome to ${BRAND}`,
    html: shell({
      preheader: `Set up your account at ${BRAND}.`,
      heading: resend ? "Finish setting up" : "Welcome!",
      body,
    }),
  });
}

// --- Vaccine expiring soon ------------------------------------------------

export async function sendVaccineExpiryReminder(args: {
  to: string;
  customerName: string;
  dogName: string;
  vaccineLabels: string[]; // e.g. ["Rabies", "Bordetella"]
  expiresOn: string; // ISO YYYY-MM-DD
}) {
  const { to, customerName, dogName, vaccineLabels, expiresOn } = args;
  const list =
    vaccineLabels.length === 1
      ? vaccineLabels[0]
      : vaccineLabels.slice(0, -1).join(", ") +
        " and " +
        vaccineLabels[vaccineLabels.length - 1];

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">A quick heads-up — <strong style="color:${COLOR.text};">${escape(dogName)}</strong>'s <strong style="color:${COLOR.text};">${escape(list)}</strong> vaccine record${vaccineLabels.length === 1 ? "" : "s"} expire${vaccineLabels.length === 1 ? "s" : ""} on <strong style="color:${COLOR.text};">${escape(formatDateShort(expiresOn))}</strong>.</p>
    ${detailCard([
      { label: "Dog", value: escape(dogName) },
      { label: "Vaccine" + (vaccineLabels.length === 1 ? "" : "s"), value: escape(list) },
      { label: "Expires", value: escape(formatDateShort(expiresOn)) },
    ])}
    <p style="margin:16px 0 4px;font-family:${FONT};font-size:15px;line-height:1.55;color:${COLOR.textMuted};">After it expires we can't accept ${escape(dogName)} for daycare or boarding until we have a current record. Upload a new one whenever you're at the vet.</p>
    ${button(`${appUrl()}/dogs`, "Upload a new record")}
  `;

  await send({
    to,
    subject: `Heads-up: ${dogName}'s vaccine is expiring soon`,
    html: shell({
      preheader: `${dogName}'s ${list} expires ${formatDateShort(expiresOn)}.`,
      heading: "Vaccine expiring soon",
      body,
    }),
  });
}

// --- Report card ready ----------------------------------------------------

export async function sendReportCardReady(args: {
  to: string;
  customerName: string;
  dogName: string;
  serviceKind: "daycare" | "boarding";
  serviceDate: string;
  serviceEndDate: string;
}) {
  const { to, customerName, dogName, serviceKind, serviceDate, serviceEndDate } =
    args;

  const dateLabel =
    serviceKind === "boarding"
      ? `${formatDateShort(serviceDate)} → ${formatDateShort(serviceEndDate)}`
      : formatDateShort(serviceDate);

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">We made a report card for <strong style="color:${COLOR.text};">${escape(dogName)}</strong> — a quick note plus some photos from the day.</p>
    ${detailCard([
      { label: "Dog", value: escape(dogName) },
      { label: serviceKind === "boarding" ? "Stay" : "Day", value: escape(dateLabel) },
    ])}
    ${button(`${appUrl()}/bookings`, `See ${escape(dogName)}'s report card`)}
    <p style="margin:14px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${COLOR.textMuted};">Thanks for trusting us with ${escape(dogName)}. 🐾</p>
  `;

  await send({
    to,
    subject: `${dogName}'s report card is ready`,
    html: shell({
      preheader: `A note + photos from ${dogName}'s ${serviceKind === "boarding" ? "stay" : "day"}.`,
      heading: `${dogName}'s report card`,
      body,
    }),
  });
}

// --- Waitlist offer -------------------------------------------------------

export async function sendWaitlistOffer(args: {
  to: string;
  customerName: string;
  dogName: string;
  serviceKind: "daycare" | "boarding";
  dates: string[]; // ISO YYYY-MM-DD, the freed span
  expiresAt: string; // ISO timestamp the offer lapses
}) {
  const { to, customerName, dogName, serviceKind, dates, expiresAt } = args;

  const deadline = new Date(expiresAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.DAYCARE_TIMEZONE ?? "America/Chicago",
  });
  const spanLabel =
    serviceKind === "boarding" && dates.length > 1
      ? `${formatDateShort(dates[0])} → ${formatDateShort(dates[dates.length - 1])}`
      : formatDateShort(dates[0]);
  const kindWord = serviceKind === "boarding" ? "boarding" : "day care";

  const body = `
    <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.text};">Hi ${escape(customerName)},</p>
    <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLOR.textMuted};">Good news — a ${kindWord} spot just opened up for <strong style="color:${COLOR.text};">${escape(dogName)}</strong>, and you're next in line. We're holding it for you until <strong style="color:${COLOR.text};">${escape(deadline)}</strong>.</p>
    ${dateChips(dates)}
    ${detailCard([
      { label: "Dog", value: escape(dogName) },
      { label: serviceKind === "boarding" ? "Stay" : "Day", value: escape(spanLabel) },
      { label: "Claim by", value: escape(deadline) },
    ])}
    ${button(`${appUrl()}/bookings`, "Claim your spot")}
    <p style="margin:14px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${COLOR.textMuted};">Pay to confirm before the deadline. If we don't hear from you, we'll offer the spot to the next person in line.</p>
  `;

  await send({
    to,
    subject: `A spot opened up for ${dogName}`,
    html: shell({
      preheader: `Claim ${dogName}'s ${kindWord} spot by ${deadline}.`,
      heading: "A spot just opened up",
      body,
    }),
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
