"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for server-action forms: disables while pending (blocks
 * double-submit on money forms) and can ask for confirmation first
 * (irreversible actions like Cancel shop).
 */
export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingLabel = "Working…",
  confirm,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  confirm?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
