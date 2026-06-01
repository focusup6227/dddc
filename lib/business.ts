// ─────────────────────────────────────────────────────────────────────────
// Public business info shown on the marketing landing page.
// Edit these values to match reality. Everything that appears on the public
// home page (hours, address, phone, FAQ) is driven from this one file.
//
// ⚠️  The contact + hours below are PLACEHOLDERS — update them before sharing
//     the site publicly.
// ─────────────────────────────────────────────────────────────────────────

export const business = {
  name: "Dixon Doggy Day Care & Boarding",
  // Used for the "tel:" link and display. Keep digits + formatting in sync.
  phone: "(662) 200-6990",
  phoneHref: "tel:+16622006990",
  email: "patriciarene1234@gmail.com",
  // Full street address, shown on the page and used for the map.
  address: {
    line1: "7383 Dean Road",
    city: "Lake Cormorant",
    region: "MS",
    postal: "38641",
  },
} as const;

export const fullAddress = `${business.address.line1}, ${business.address.city}, ${business.address.region} ${business.address.postal}`;

// Embeddable Google Maps URL — no API key required.
export const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(
  fullAddress,
)}&output=embed`;
export const mapLinkUrl = `https://www.google.com/maps?q=${encodeURIComponent(
  fullAddress,
)}`;

// Opening hours. `hours: null` renders as "Closed". Open 7 days, 6 AM – 6 PM.
export const hours: { day: string; hours: string | null }[] = [
  { day: "Monday", hours: "6:00 AM – 6:00 PM" },
  { day: "Tuesday", hours: "6:00 AM – 6:00 PM" },
  { day: "Wednesday", hours: "6:00 AM – 6:00 PM" },
  { day: "Thursday", hours: "6:00 AM – 6:00 PM" },
  { day: "Friday", hours: "6:00 AM – 6:00 PM" },
  { day: "Saturday", hours: "6:00 AM – 6:00 PM" },
  { day: "Sunday", hours: "6:00 AM – 6:00 PM" },
];

// Frequently asked questions. Answers below are written to match how the app
// actually works (required vaccines, payment timing, etc.) — tweak the wording
// to your voice, but keep the facts accurate.
export const faqs: { q: string; a: string }[] = [
  {
    q: "What do I need before my dog's first day?",
    a: "Create an account, add your dog's profile, upload current Rabies, DHPP, and Bordetella vaccine records, and sign our waiver. Once those are on file you can book a day or a stay.",
  },
  {
    q: "Which vaccines are required?",
    a: "We need current Rabies, DHPP (distemper/parvo), and Bordetella (kennel cough) records on file before your dog's first visit. We'll remind you by email before any of them expire.",
  },
  {
    q: "How does payment work?",
    a: "Payment is due when the appointment is complete. You can pay securely online by card, scan a QR code to pay from your phone at pickup, or pay in person — whatever's easiest.",
  },
  {
    q: "What's your cancellation policy?",
    a: "Plans change — we get it. Cancel or reschedule more than 24 hours before your booking and you'll get a full refund. Within 24 hours, half the cost is refunded and the other half is kept (credited to your account if you'd already paid). You can cancel anytime from your bookings page.",
  },
  {
    q: "Does boarding include day care?",
    a: "Yes. Overnight boarders join the daytime play group at no extra charge, so your dog stays busy and tired in the best way.",
  },
  {
    q: "Can you give my dog a bath?",
    a: "We do! Add a bath to any day care or boarding stay for $10 and your pup goes home clean and fresh.",
  },
  {
    q: "What should I pack?",
    a: "Bring your dog's food portioned per meal, any medications with instructions, and a comfort item if they like one. We'll track meals, meds, and routines for you, and check belongings in and out.",
  },
  {
    q: "How big are the play groups?",
    a: "Small and supervised. We cap how many dogs we take each day so every pup gets real attention, real play, and real rest.",
  },
];
