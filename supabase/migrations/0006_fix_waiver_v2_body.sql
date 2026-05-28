-- Update the v2 waiver body to add the intro paragraph from v1 and
-- the photos clause. (0005 already ran on the live DB with a shorter
-- body; this brings it in line with the corrected 0005 file.)

update public.waivers
set
  title = 'Dixon Doggy Day Care — Liability Waiver',
  body_markdown = $$
**Dixon Doggy Day Care — Liability Waiver and Release**

In consideration of Dixon Doggy Day Care ("DDDC") accepting my dog(s) for day care, boarding, grooming, or related services, I agree to the following:

1. **Inherent Risk.** I understand that dog play and group boarding involves inherent risks, including but not limited to scratches, bites, and the spread of illness. I voluntarily assume these risks.

2. **Health Warranty.** I certify that my dog is in good health, is current on all required vaccinations, and has not shown aggression toward people or other dogs.

3. **Medical Emergency.** In the event of a medical emergency, Dixon's is authorized to seek veterinary treatment. I understand I am responsible for all associated costs.

4. **Owner Liability.** I agree that I am solely responsible for any damage or injury caused by my dog while in the care of Dixon's Doggy Daycare & Boarding.

5. **Release of Liability.** I hereby release Dixon's Doggy Daycare & Boarding, its owners, and employees from any liability for injury, death, or property damage, except in cases of gross negligence.

6. **Behavioral Logs & Discretionary Care.** I understand that Dixon's Doggy Daycare maintains detailed behavioral and incident logs for all dogs. Dixon's reserves the right to refuse service, suspend, or terminate daycare privileges at any time, at their sole discretion, based on these behavioral reports to ensure the safety of all dogs and staff.

7. **Photos.** I grant DDDC permission to take and use photos/videos of my dog for promotional purposes.

Dixon's maintains Animal Bailee (Care, Custody, or Control) insurance as an added layer of protection for our guests.

By typing my full legal name and submitting this form, I agree this constitutes an electronic signature equivalent to a handwritten signature under the federal E-SIGN Act and applicable state law.
  $$
where version = 'v2-2026-05';
