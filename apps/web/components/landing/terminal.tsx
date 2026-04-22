"use client";

import { useMemo, useState } from "react";

type Tone = "input" | "plain" | "dim" | "ok" | "muted";
type Line = { readonly tone: Tone; readonly text: string };
type Scene = { readonly name: string; readonly data: readonly Line[] };

const scenes: readonly Scene[] = [
  {
    name: "agent",
    data: [
      { tone: "muted", text: "> refresh the local-first shell" },
      { tone: "dim", text: "openai/gpt-5.4" },
      { tone: "plain", text: "" },
      { tone: "ok", text: "searching files matching hosted*" },
      { tone: "ok", text: "reading landing/features.tsx (96 lines)" },
      { tone: "ok", text: "editing settings/preferences-section.tsx" },
      { tone: "ok", text: "editing landing/footer.tsx" },
      { tone: "ok", text: "removing dead auth/profile files" },
      { tone: "ok", text: "running bun run ci" },
      { tone: "plain", text: "" },
      { tone: "plain", text: "local-first cleanup is live. browser ids," },
      { tone: "plain", text: "landing copy, and dead hosted files updated." },
      { tone: "plain", text: "ci passes clean." },
    ],
  },
  {
    name: "sandbox",
    data: [
      { tone: "muted", text: "> patch the sandbox flow for local use" },
      { tone: "dim", text: "sandbox: docker-container (session isolated)" },
      { tone: "plain", text: "" },
      { tone: "ok", text: "creating sandbox container from base image" },
      { tone: "ok", text: "mounting isolated /workspace" },
      { tone: "ok", text: "attaching traefik labels" },
      { tone: "ok", text: "starting code-server" },
      { tone: "ok", text: "starting dev server" },
      { tone: "ok", text: "removing container on release" },
      { tone: "plain", text: "" },
      { tone: "plain", text: "sandbox run complete." },
      { tone: "dim", text: "  image: open-agents-sandbox:local" },
      { tone: "dim", text: "  workspace: /workspace" },
      { tone: "ok", text: "workspace preserved until release" },
    ],
  },
  {
    name: "subagent",
    data: [
      { tone: "muted", text: "> trim the hosted leftovers" },
      { tone: "dim", text: "delegating to explorer subagent..." },
      { tone: "plain", text: "" },
      { tone: "ok", text: "glob apps/web/** (local-first sweep)" },
      { tone: "ok", text: "finding empty auth/github/preview routes" },
      { tone: "ok", text: "cross-referencing unused settings sections" },
      { tone: "plain", text: "" },
      { tone: "plain", text: "found dead files to delete:" },
      { tone: "dim", text: "  components/auth/auth-guard.tsx" },
      { tone: "dim", text: "  app/settings/profile-section.tsx" },
      { tone: "dim", text: "  app/settings/leaderboard-section.tsx" },
      { tone: "dim", text: "  .agents/skills/deploy-open-harness" },
      { tone: "dim", text: "  .agents/skills/remove-demo-limits" },
      { tone: "plain", text: "" },
      { tone: "muted", text: "removing dead routes, files, and skills..." },
    ],
  },
];

function lineStyle(tone: Tone): string {
  switch (tone) {
    case "input":
      return "text-(--l-panel-fg)";
    case "dim":
      return "text-(--l-panel-fg-4)";
    case "ok":
      return "text-(--l-panel-fg)";
    case "muted":
      return "text-(--l-panel-fg-2)";
    default:
      return "text-(--l-panel-fg)";
  }
}

export function HeroTerminal() {
  const [slot, setSlot] = useState(0);
  const active = scenes[slot]!;
  const rows = useMemo(() => active.data, [active]);

  return (
    <div className="group flex h-[420px] flex-col transition-all duration-300 md:h-[480px]">
      <div className="flex items-center justify-between border-b border-(--l-panel-border) bg-(--l-panel-surface) px-3 py-2">
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-(--l-panel-fg-2)">
          <div>
            mode <span className="text-(--l-panel-fg)">{active.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-(--l-panel-fg-2)">
          <span className="inline-flex size-1.5 rounded-full bg-(--l-accent)/70" />
          running
        </div>
      </div>

      <div className="terminal-scroll flex-1 overflow-y-auto bg-(--l-code-bg) px-4 py-3 font-mono text-[12px] leading-[1.62] tabular-nums">
        {rows.map((row, index) => (
          <div
            key={`${active.name}-${index}`}
            className={`${lineStyle(row.tone)} transition-colors duration-150`}
          >
            {row.text || "\u00A0"}
          </div>
        ))}
      </div>

      <div className="border-t border-(--l-panel-border) bg-(--l-panel-surface) px-2 py-1.5">
        <div className="terminal-scroll flex items-center gap-1 overflow-x-auto font-mono text-[11px] text-(--l-panel-fg-2)">
          {scenes.map((scene, index) => {
            const current = index === slot;
            return (
              <button
                key={scene.name}
                type="button"
                onClick={() => setSlot(index)}
                className={`shrink-0 rounded-sm border px-2.5 py-1 transition-colors duration-150 ${
                  current
                    ? "border-(--l-panel-border) bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "border-transparent text-(--l-panel-fg-2) hover:border-(--l-panel-border) hover:text-(--l-panel-fg)"
                }`}
              >
                {current ? `*${scene.name}` : scene.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
