// Minimal hand-written DB types. Regenerate with `supabase gen types typescript`
// once you wire up the Supabase CLI to your project.

export type UserRole = "customer" | "staff";
export type BookingStatus =
  | "reserved"
  | "checked_in"
  | "checked_out"
  | "no_show"
  | "canceled";
export type PaymentKind = "package" | "drop_in";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "failed";
export type ServiceKind = "daycare" | "boarding";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  referral_code: string | null;
  account_credit_cents: number;
  created_at: string;
  updated_at: string;
}

export interface Dog {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  sex: "male" | "female" | null;
  spayed_neutered: boolean;
  date_of_birth: string | null;
  weight_lbs: number | null;
  color: string | null;
  photo_path: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  microchipped: boolean;
  microchip_number: string | null;
  vaccinations_current: boolean;
  vaccination_notes: string | null;
  allergies: string | null;
  medications: string | null;
  feeding_notes: string | null;
  behavior_notes: string | null;
  staff_notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Waiver {
  id: string;
  version: string;
  title: string;
  body_markdown: string;
  active: boolean;
  created_at: string;
}

export interface WaiverSignature {
  id: string;
  user_id: string;
  waiver_id: string;
  signed_full_name: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

export interface Package {
  id: string;
  name: string;
  description: string | null;
  days_included: number;
  price_cents: number;
  active: boolean;
  sort_order: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
}

export interface CustomerPackage {
  id: string;
  customer_id: string;
  package_id: string;
  days_total: number;
  days_remaining: number;
  amount_paid_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  payment_status: PaymentStatus;
  expires_at: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  dog_id: string;
  service_date: string;
  service_end_date: string; // exclusive — daycare = service_date + 1, boarding = checkout date
  service_kind: ServiceKind;
  drop_off_time: string | null;
  pickup_time: string | null;
  status: BookingStatus;
  payment_kind: PaymentKind;
  customer_package_id: string | null;
  unit_price_cents: number | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  payment_status: PaymentStatus;
  credit_applied_cents: number;
  coupon_id: string | null;
  coupon_discount_cents: number;
  notes: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  cancellation_reason: string | null;
  refund_amount_cents: number | null;
  stripe_refund_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckIn {
  id: string;
  booking_id: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  checked_out_at: string | null;
  checked_out_by: string | null;
  arrival_notes: string | null;
  departure_notes: string | null;
}

export interface DogNote {
  id: string;
  dog_id: string;
  booking_id: string | null;
  author_id: string;
  note: string;
  created_at: string;
}

export interface ReportCard {
  id: string;
  booking_id: string;
  note: string;
  published_at: string | null;
  published_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReportCardPhoto {
  id: string;
  report_card_id: string;
  storage_path: string;
  caption: string | null;
  photo_date: string | null;
  sort_order: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

export type ChoreKind = "walk" | "sanitize" | "manual";
export type ChoreRecurrence = "none" | "daily" | "weekly";

export interface Chore {
  id: string;
  kind: ChoreKind;
  title: string;
  description: string | null;
  due_date: string | null;
  dog_id: string | null;
  booking_id: string | null;
  auto_key: string | null;
  parent_chore_id: string | null;
  recurrence: ChoreRecurrence;
  weekday: number | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface Blackout {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  blocks_daycare: boolean;
  blocks_boarding: boolean;
  created_at: string;
}

export interface RecurringBooking {
  id: string;
  customer_id: string;
  dog_id: string;
  weekdays: number[];
  start_date: string;
  end_date: string | null;
  drop_off_time: string;
  pickup_time: string;
  active: boolean;
  created_at: string;
}

export type VaccineType = "rabies" | "dhpp" | "bordetella";
export type VaccinationStatus = "pending" | "verified" | "rejected";

export interface DogVaccination {
  id: string;
  dog_id: string;
  vaccine_type: VaccineType;
  document_path: string;
  expires_on: string;
  status: VaccinationStatus;
  uploaded_at: string;
  uploaded_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  reminder_sent_at: string | null;
}

export type ReferralStatus = "pending" | "credited";

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  status: ReferralStatus;
  credit_cents: number;
  credited_at: string | null;
  created_at: string;
}

export type IncidentKind =
  | "bite"
  | "injury"
  | "escape"
  | "illness"
  | "property_damage"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high";

export interface Incident {
  id: string;
  dog_id: string;
  occurred_on: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  description: string;
  reporter_id: string | null;
  customer_notified_at: string | null;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_per_day_cents: number;
  active: boolean;
  expires_on: string | null;
  created_at: string;
}

export interface IncidentPhoto {
  id: string;
  incident_id: string;
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}
