import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocalDeployment } from "@/lib/deployment/mode";
import { LeaderboardSection } from "../leaderboard-section";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Internal organization leaderboard ranked by token usage.",
};

export default function LeaderboardPage() {
  if (isLocalDeployment()) {
    notFound();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <LeaderboardSection />
    </>
  );
}
