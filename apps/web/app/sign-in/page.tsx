import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LocalSignInForm } from "@/components/auth/local-sign-in-form";
import { isLocalDeployment } from "@/lib/deployment/mode";
import { sanitizeInternalRedirect } from "@/lib/redirect-safety";
import { getServerSession } from "@/lib/session/get-server-session";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  if (!isLocalDeployment()) {
    redirect("/");
  }

  const session = await getServerSession();
  const resolvedSearchParams = await searchParams;
  const requestedNext =
    typeof resolvedSearchParams.next === "string"
      ? resolvedSearchParams.next
      : undefined;
  const callbackUrl = sanitizeInternalRedirect(requestedNext, "/sessions");

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Sign in to Open Agents</h1>
          <p className="text-sm text-muted-foreground">
            Use the local owner credentials configured on this server.
          </p>
        </div>
        <LocalSignInForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
