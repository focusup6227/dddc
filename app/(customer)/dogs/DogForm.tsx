"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dog } from "@/lib/supabase/types";
import { DogAvatar } from "@/components/DogAvatar";

export function DogForm({
  action,
  dog,
}: {
  action: (formData: FormData) => Promise<void>;
  dog?: Dog;
}) {
  const [photoPath, setPhotoPath] = useState<string | null>(dog?.photo_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const dogId = dog?.id ?? "new";
      const key = `${user.id}/${dogId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("dog-photos")
        .upload(key, file, { upsert: true, contentType: file.type });

      if (upErr) throw upErr;
      setPhotoPath(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={action} className="mt-6 space-y-6">
      {dog?.id && <input type="hidden" name="id" value={dog.id} />}
      <input type="hidden" name="photo_path" value={photoPath ?? ""} />

      <section className="card">
        <h3 className="font-semibold text-stone-900">Photo</h3>
        <div className="mt-3 flex items-center gap-4">
          <DogAvatar photoPath={photoPath} name={dog?.name ?? "Dog"} size={96} />
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="block text-sm"
              disabled={uploading}
            />
            {uploading && <p className="mt-1 text-xs text-stone-500">Uploading…</p>}
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h3 className="font-semibold text-stone-900">Basics</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field name="name" label="Name" required defaultValue={dog?.name} />
          <Field name="breed" label="Breed" defaultValue={dog?.breed ?? ""} />
          <div>
            <label className="label">Sex</label>
            <select name="sex" defaultValue={dog?.sex ?? ""} className="input">
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <Field
            name="weight_lbs"
            label="Weight (lbs)"
            type="number"
            step="0.1"
            defaultValue={dog?.weight_lbs?.toString() ?? ""}
          />
          <Field
            name="date_of_birth"
            label="Date of birth"
            type="date"
            defaultValue={dog?.date_of_birth ?? ""}
          />
          <Field name="color" label="Color" defaultValue={dog?.color ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="spayed_neutered"
            value="yes"
            defaultChecked={dog?.spayed_neutered ?? false}
            className="h-4 w-4 rounded border-stone-300"
          />
          Spayed / neutered
        </label>
      </section>

      <section className="card space-y-4">
        <h3 className="font-semibold text-stone-900">Microchip</h3>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="microchipped"
            value="yes"
            defaultChecked={dog?.microchipped ?? false}
            className="h-4 w-4 rounded border-stone-300"
          />
          Microchipped
        </label>
        <Field
          name="microchip_number"
          label="Chip number (if known)"
          defaultValue={dog?.microchip_number ?? ""}
        />
      </section>

      <section className="card space-y-4">
        <h3 className="font-semibold text-stone-900">Health & vet</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field name="vet_name" label="Vet name" defaultValue={dog?.vet_name ?? ""} />
          <Field name="vet_phone" label="Vet phone" defaultValue={dog?.vet_phone ?? ""} />
        </div>
        <Textarea
          name="allergies"
          label="Allergies"
          defaultValue={dog?.allergies ?? ""}
        />
        <Textarea
          name="medications"
          label="Medications"
          defaultValue={dog?.medications ?? ""}
        />
        {!dog && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            After you save, you&apos;ll be asked to upload your dog&apos;s vaccine
            records (Rabies, DHPP, Bordetella) before booking.
          </p>
        )}
      </section>

      <section className="card space-y-4">
        <h3 className="font-semibold text-stone-900">Care notes</h3>
        <Textarea
          name="feeding_notes"
          label="Feeding instructions"
          defaultValue={dog?.feeding_notes ?? ""}
        />
        <Textarea
          name="behavior_notes"
          label="Behavior / personality"
          defaultValue={dog?.behavior_notes ?? ""}
        />
      </section>

      <div className="flex justify-end gap-3">
        <button type="submit" className="btn-primary">
          {dog ? "Save changes" : "Add dog"}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  step,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className="input"
      />
    </div>
  );
}

function Textarea({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        defaultValue={defaultValue}
        className="input"
      />
    </div>
  );
}
