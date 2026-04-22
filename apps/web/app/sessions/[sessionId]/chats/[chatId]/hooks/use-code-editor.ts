"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CodeEditorLaunchResponse,
  CodeEditorStatusResponse,
} from "@/app/api/sessions/[sessionId]/code-editor/route";
import { normalizeClientExternalUrl } from "@/lib/client-external-url";

export type CodeEditorState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "stopping"; info: CodeEditorLaunchResponse }
  | { status: "error"; message: string }
  | { status: "ready"; info: CodeEditorLaunchResponse };

export interface CodeEditorControls {
  state: CodeEditorState;
  menuLabel: string;
  menuDetail: string | null;
  showStopAction: boolean;
  handleOpen: () => Promise<void>;
  handleOpenFile: (filePath: string) => Promise<void>;
  handleStop: () => Promise<void>;
}

function shouldOpenEditorExternally(url: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const parsed = new URL(url);
    return window.location.protocol === "https:" && parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body) || typeof body.error !== "string") {
    return fallback;
  }

  return body.error;
}

function parseLaunchResponse(body: unknown): CodeEditorLaunchResponse | null {
  if (!isRecord(body)) {
    return null;
  }

  const { url, port } = body;
  const normalizedUrl =
    typeof url === "string" ? normalizeClientExternalUrl(url) : null;
  if (typeof port !== "number" || !Number.isFinite(port) || !normalizedUrl) {
    return null;
  }

  return { url: normalizedUrl, port };
}

export function useCodeEditor({
  sessionId,
  canRun,
}: {
  sessionId: string;
  canRun: boolean;
}): CodeEditorControls {
  const router = useRouter();
  const [state, setState] = useState<CodeEditorState>({ status: "idle" });

  useEffect(() => {
    setState({ status: "idle" });
  }, [sessionId]);

  useEffect(() => {
    if (!canRun) {
      setState({ status: "idle" });
    }
  }, [canRun]);

  // Check if code-server is already running on mount / session change
  const hasCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canRun || hasCheckedRef.current === sessionId) {
      return;
    }
    hasCheckedRef.current = sessionId;

    let cancelled = false;

    async function checkStatus() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/code-editor`);
        if (!response.ok || cancelled) {
          return;
        }

        const body = (await response.json()) as CodeEditorStatusResponse;
        if (cancelled) {
          return;
        }

        const normalizedUrl =
          typeof body.url === "string"
            ? normalizeClientExternalUrl(body.url)
            : null;
        if (body.running && normalizedUrl) {
          setState({
            status: "ready",
            info: { url: normalizedUrl, port: body.port },
          });
        }
      } catch {
        // Silently ignore — status check is best-effort
      }
    }

    void checkStatus();

    return () => {
      cancelled = true;
    };
  }, [canRun, sessionId]);

  const openEditorPage = useCallback(() => {
    router.push(`/codespace/${sessionId}`);
  }, [router, sessionId]);

  const openEditorUrl = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  /**
   * Ensure code-server is running and return the launch response.
   * Returns the existing info if already ready, otherwise launches.
   */
  const ensureRunning =
    useCallback(async (): Promise<CodeEditorLaunchResponse | null> => {
      if (state.status === "ready") {
        return state.info;
      }

      if (state.status === "starting" || state.status === "stopping") {
        return null;
      }

      setState({ status: "starting" });

      try {
        const response = await fetch(`/api/sessions/${sessionId}/code-editor`, {
          method: "POST",
        });
        const body: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            getErrorMessage(body, "Failed to launch code editor"),
          );
        }

        const launchResponse = parseLaunchResponse(body);
        if (!launchResponse) {
          throw new Error("Invalid code editor response");
        }

        setState({
          status: "ready",
          info: launchResponse,
        });

        return launchResponse;
      } catch (error) {
        console.error("Failed to launch code editor:", error);
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to launch code editor",
        });
        return null;
      }
    }, [sessionId, state]);

  const handleOpen = useCallback(async () => {
    const info = await ensureRunning();
    if (info) {
      if (shouldOpenEditorExternally(info.url)) {
        openEditorUrl(info.url);
        return;
      }

      openEditorPage();
    }
  }, [ensureRunning, openEditorPage, openEditorUrl]);

  const handleOpenFile = useCallback(
    async (_filePath: string) => {
      const info = await ensureRunning();
      if (info) {
        if (shouldOpenEditorExternally(info.url)) {
          openEditorUrl(info.url);
          return;
        }

        // Open the codespace page; file-specific deep linking can be added
        // to the codespace route later via query parameters.
        openEditorPage();
      }
    },
    [ensureRunning, openEditorPage, openEditorUrl],
  );

  const handleStop = useCallback(async () => {
    if (state.status !== "ready") {
      return;
    }

    setState({ status: "stopping", info: state.info });

    try {
      const response = await fetch(`/api/sessions/${sessionId}/code-editor`, {
        method: "DELETE",
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(body, "Failed to stop code editor"));
      }

      setState({ status: "idle" });
    } catch (error) {
      console.error("Failed to stop code editor:", error);
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to stop code editor",
      });
    }
  }, [sessionId, state]);

  const menuLabel =
    state.status === "ready"
      ? "Open Editor"
      : state.status === "starting"
        ? "Starting Editor..."
        : state.status === "stopping"
          ? "Stopping Editor..."
          : state.status === "error"
            ? "Retry Editor"
            : "Open Editor";

  const menuDetail =
    state.status === "ready" || state.status === "stopping"
      ? "Running"
      : state.status === "error"
        ? state.message
        : null;

  const showStopAction =
    canRun && (state.status === "ready" || state.status === "stopping");

  return {
    state,
    menuLabel,
    menuDetail,
    showStopAction,
    handleOpen,
    handleOpenFile,
    handleStop,
  } as const;
}
