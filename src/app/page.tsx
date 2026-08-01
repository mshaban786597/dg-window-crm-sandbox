import { redirect } from "next/navigation";

/**
 * Root entry. Sends users into the client workspace (§2). The login page routes
 * platform administrators to /platform-admin instead.
 */
export default function Home() {
  redirect("/app/dashboard");
}
