"use client";

import useSWR from "swr";
import type { LeaderboardRankResponse } from "@/app/api/usage/rank/route";
import { isLocalDeploymentClient } from "@/lib/deployment/mode";
import { fetcher } from "@/lib/swr";

export const LEADERBOARD_RANK_SWR_KEY = "/api/usage/rank";

export function useLeaderboardRank() {
  const enabled = !isLocalDeploymentClient();
  const { data, isLoading } = useSWR<LeaderboardRankResponse | null>(
    enabled ? LEADERBOARD_RANK_SWR_KEY : null,
    fetcher,
    {
      dedupingInterval: 30_000,
    },
  );

  return {
    rank: enabled ? (data ?? null) : null,
    loading: enabled && isLoading,
  };
}
