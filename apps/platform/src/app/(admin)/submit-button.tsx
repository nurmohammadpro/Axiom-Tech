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
  formAction,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  confirm?: string;
  name?: string;
  value?: string;
  /** Runs a different server action than the form's own (e.g. Delete inside an Update form). */
  formAction?: (fd: FormData) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
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
