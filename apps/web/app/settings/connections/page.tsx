import type { Metadata } from "next";
import { Suspense } from "react";
import { isLocalDeployment } from "@/lib/deployment/mode";
import { AccountsSection, AccountsSectionSkeleton } from "../accounts-section";
import { VercelSection, VercelSectionSkeleton } from "../vercel-section";

export const metadata: Metadata = {
  title: "Connections",
  description: "Manage your connected accounts and integrations.",
};

export default function ConnectionsPage() {
  const localDeployment = isLocalDeployment();

  return (
    <>
      <h1 className="text-2xl font-semibold">Connections</h1>
      {!localDeployment ? (
        <Suspense fallback={<VercelSectionSkeleton />}>
          <VercelSection />
        </Suspense>
      ) : null}
      <Suspense fallback={<AccountsSectionSkeleton />}>
        <AccountsSection />
      </Suspense>
    </>
  );
}
