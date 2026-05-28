export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/logout" method="post">
      <button type="submit" className={className ?? "btn-ghost text-sm"}>
        Sign out
      </button>
    </form>
  );
}
