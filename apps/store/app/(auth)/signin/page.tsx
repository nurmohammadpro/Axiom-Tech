import { redirect } from "next/navigation";

// The sign-in page moved to `/` (PWA entry point). Keep this route so old
// links and bookmarks land on the new page.
export default function SigninRedirect() {
  redirect("/");
}
