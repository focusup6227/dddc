import { DogForm } from "../DogForm";
import { saveDog } from "../actions";

export default function NewDogPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900">Add a dog</h1>
      <p className="mt-1 text-sm text-ink-700">
        Tell us about your pup so we can take great care of them.
      </p>
      <DogForm action={saveDog} />
    </div>
  );
}
