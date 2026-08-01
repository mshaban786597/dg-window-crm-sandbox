"use server";

/**
 * Platform console Server Actions (§10).
 *
 * Kept separate from the sign-in actions so the client shell can import a
 * sign-out action without pulling the authentication flow into its bundle.
 */

import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/auth-actions";

/**
 * End the platform session and return to the platform sign-in screen.
 *
 * Also clears the active-tenant cookie, so a platform operator can never leave
 * a workspace hint behind for the next session on this browser.
 */
export async function platformSignOutAction(): Promise<void> {
  await signOut();
  redirect("/platform-admin/login");
}
