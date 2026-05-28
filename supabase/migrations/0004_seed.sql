-- Seed: initial waiver template + a couple of starter packages.
-- Safe to re-run.

insert into public.waivers (version, title, body_markdown, active)
values (
  'v1-2026-05',
  'Dixon Doggy Day Care Liability Waiver',
  $$
**Dixon Doggy Day Care — Liability Waiver and Release**

In consideration of Dixon Doggy Day Care ("DDDC") accepting my dog(s) for day care, boarding, grooming, or related services, I agree to the following:

1. **Health & Vaccinations.** I certify that my dog(s) are in good health and current on Rabies, DHPP, and Bordetella vaccinations.
2. **Behavior.** I certify my dog has not harmed or shown aggression toward any person or other dog. If my dog displays aggressive behavior at DDDC, I authorize staff to remove my dog from group play.
3. **Veterinary Care.** If my dog becomes ill or injured, I authorize DDDC to seek veterinary care at my expense.
4. **Assumption of Risk.** I understand that group play carries inherent risks including but not limited to scratches, bites, injuries, illness, and stress. I assume all such risks.
5. **Release.** I release DDDC, its owners, and employees from any and all claims arising out of my dog's stay, except in cases of gross negligence.
6. **Fees.** I agree to pay all fees for services rendered, including additional fees for late pickup or veterinary care.
7. **Photos.** I grant DDDC permission to take and use photos/videos of my dog for promotional purposes.

By typing my full legal name and submitting this form, I agree this constitutes an electronic signature equivalent to a handwritten signature under the federal E-SIGN Act and applicable state law.
  $$,
  true
)
on conflict (version) do nothing;

insert into public.packages (name, description, days_included, price_cents, sort_order)
values
  ('Single Day Drop-In', 'One day of day care.', 1, 4500, 0),
  ('5-Day Pack',  'Five days of day care. Save 10%.', 5, 20250, 1),
  ('10-Day Pack', 'Ten days of day care. Save 15%.', 10, 38250, 2),
  ('20-Day Pack', 'Twenty days of day care. Save 20%.', 20, 72000, 3)
on conflict do nothing;
