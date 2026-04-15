"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const sequence = [
  { state: "leasing", ms: 1400 },
  { state: "active", ms: 2400 },
  { state: "busy", ms: 1600 },
  { state: "resetting", ms: 1200 },
  { state: "ready", ms: 1800 },
] as const;

type State = (typeof sequence)[number]["state"];

const descriptions: Record<State, string> = {
  leasing: "assigning an isolated Proxmox LXC from the pool",
  active: "workspace, editor, network, and runtime access ready",
  busy: "agent is editing files and running commands",
  resetting: "hard-resetting the node before release",
  ready: "clean sandbox waiting for the next session",
};

export function FeatureSandbox() {
  const [idx, setIdx] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const entry = sequence[idx]!;

  const advance = useCallback(() => {
    setIdx((prev) => {
      const next = prev + 1;
      return next >= sequence.length ? 0 : next;
    });
  }, []);

  useEffect(() => {
    timeoutRef.current = setTimeout(advance, entry.ms);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [idx, entry.ms, advance]);

  return (
    <div className="flex h-[280px] flex-col bg-(--l-code-bg)">
      <div className="flex-1 px-5 py-4">
        <div className="flex items-center gap-3 font-mono text-[12px]">
          <span className="text-(--l-panel-fg-3)">sandbox</span>
          <span className="text-(--l-panel-fg-2)">open-agents-2</span>
        </div>

        <div className="mt-6 flex gap-1">
          {sequence.map((_, i) => (
            <div
              key={i}
              className="h-px flex-1 transition-all duration-700"
              style={{
                backgroundColor:
                  i === idx
                    ? "var(--l-panel-fg-2)"
                    : i < idx
                      ? "var(--l-panel-fg-4)"
                      : "var(--l-panel-fg-5)",
              }}
            />
          ))}
        </div>

        <div className="mt-5">
          <div className="font-mono text-[13px] text-(--l-panel-fg)">
            {entry.state}
          </div>
          <div className="mt-1 text-[11px] text-(--l-panel-fg-3)">
            {descriptions[entry.state]}
          </div>
        </div>

        <div className="mt-8 flex gap-8 font-mono text-[10px]">
          <div>
            <div className="text-(--l-panel-fg-4)">node</div>
            <div className="mt-0.5 text-(--l-panel-fg-2)">open-agents-2</div>
          </div>
          <div>
            <div className="text-(--l-panel-fg-4)">workspace</div>
            <div className="mt-0.5 text-(--l-panel-fg-2)">
              {entry.state === "ready" ? "\u2014" : "/workspace"}
            </div>
          </div>
          <div>
            <div className="text-(--l-panel-fg-4)">reset</div>
            <div className="mt-0.5 text-(--l-panel-fg-2)">
              {entry.state === "resetting" || entry.state === "ready"
                ? "clean"
                : "pending"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
