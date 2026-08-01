/**
 * Short invitation alias (§9).
 *
 * `/invite/<token>` is the link shape used in emails; it simply forwards to the
 * canonical acceptance page. No tenant data is read or rendered here.
 */
import { redirect } from "next/navigation";

export default async function InviteRedirectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/accept-invite/${encodeURIComponent(token)}`);
}
