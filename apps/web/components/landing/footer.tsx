import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function LandingFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-[1320px] border-t border-(--l-border) px-6 py-14 md:py-18">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-4)">
              Open Agents
            </div>
            <div className="mt-3 text-sm text-(--l-fg-3)">
              Open Agents for
              <br />
              shipping code.
            </div>
          </div>

          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-4)">
              Product
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/sessions"
                className="font-mono text-sm text-(--l-fg-3) transition-colors hover:text-(--l-fg)"
              >
                Open App
              </Link>
              <a
                href="https://ai-sdk.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-(--l-fg-3) transition-colors hover:text-(--l-fg)"
              >
                AI SDK
              </a>
              <a
                href="https://useworkflow.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-(--l-fg-3) transition-colors hover:text-(--l-fg)"
              >
                Workflow SDK
              </a>
              <a
                href="https://cli.github.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-(--l-fg-3) transition-colors hover:text-(--l-fg)"
              >
                GitHub CLI
              </a>
            </div>
          </div>

          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-4)">
              Links
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href="https://github.com/kesku/open-agents"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-(--l-fg-3) transition-colors hover:text-(--l-fg)"
              >
                GitHub
              </a>
              <Link
                href="/settings/connections"
                className="text-sm text-(--l-fg-3) transition-colors hover:text-(--l-fg)"
              >
                Connections
              </Link>
              <a
                href="https://ai-sdk.dev/docs/introduction"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-(--l-fg-3) transition-colors hover:text-(--l-fg)"
              >
                AI SDK Docs
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between">
          <a
            href="https://github.com/kesku/open-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-(--l-fg-4) transition-colors hover:text-(--l-fg-2)"
          >
            kesku/open-agents
          </a>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
