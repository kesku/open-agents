"use client";

import { Boxes, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ModelProviderSettingsItem,
  type SaveModelProviderInput,
  useModelProviders,
} from "@/hooks/use-model-providers";

interface ProviderDraft {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  clearApiKey: boolean;
}

const EMPTY_DRAFT: ProviderDraft = {
  providerId: "",
  displayName: "",
  baseUrl: "",
  apiKey: "",
  clearApiKey: false,
};

function ProviderDialog({
  open,
  onOpenChange,
  initialValue,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: ModelProviderSettingsItem | null;
  isSaving: boolean;
  onSubmit: (provider: SaveModelProviderInput) => Promise<true | string>;
}) {
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(
      initialValue
        ? {
            providerId: initialValue.providerId,
            displayName: initialValue.displayName,
            baseUrl: initialValue.baseUrl,
            apiKey: "",
            clearApiKey: false,
          }
        : EMPTY_DRAFT,
    );
    setError(null);
  }, [initialValue, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const apiKey = draft.apiKey.trim();
    const result = await onSubmit({
      providerId: draft.providerId.trim(),
      displayName: draft.displayName.trim(),
      baseUrl: draft.baseUrl.trim(),
      ...(draft.clearApiKey ? { apiKey: "" } : apiKey ? { apiKey } : {}),
    });

    if (result === true) {
      onOpenChange(false);
    } else {
      setError(result);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initialValue ? "Edit Provider" : "Add Provider"}
          </DialogTitle>
          <DialogDescription>
            Configure an OpenAI-compatible API with a standard `/models`
            endpoint.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="provider-id">Provider ID</Label>
            <Input
              id="provider-id"
              value={draft.providerId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  providerId: event.target.value,
                }))
              }
              placeholder="openrouter"
              disabled={isSaving || initialValue !== null}
              required
            />
            <p className="text-xs text-muted-foreground">
              Prefixes model IDs, for example{" "}
              <code>openrouter/google/gemini</code>.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="provider-name">Display Name</Label>
            <Input
              id="provider-name"
              value={draft.displayName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              placeholder="OpenRouter"
              disabled={isSaving}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              type="url"
              value={draft.baseUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
              placeholder="https://openrouter.ai/api/v1"
              disabled={isSaving}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="provider-api-key">API Key</Label>
            <Input
              id="provider-api-key"
              type="password"
              value={draft.apiKey}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
              placeholder={
                initialValue?.hasApiKey
                  ? "Leave blank to keep the existing key"
                  : "API key"
              }
              disabled={isSaving}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Optional for keyless local servers such as Ollama or llama.cpp.
            </p>
            {initialValue?.hasApiKey ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.clearApiKey}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      clearApiKey: event.target.checked,
                    }))
                  }
                  disabled={isSaving}
                />
                Remove the stored key
              </label>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Saving…"
                : initialValue
                  ? "Save Changes"
                  : "Add Provider"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ModelProvidersSectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function ModelProvidersSection() {
  const { providers, loading, error, saveProvider, removeProvider } =
    useModelProviders();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const editingProvider =
    providers.find((provider) => provider.providerId === editingProviderId) ??
    null;

  if (loading) {
    return <ModelProvidersSectionSkeleton />;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Direct Providers
            </h3>
            <p className="text-sm text-muted-foreground">
              Use OpenAI-compatible APIs directly. Credentials are encrypted per
              user and never returned to the browser.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingProviderId(null);
              setActionError(null);
              setDialogOpen(true);
            }}
            disabled={isSaving}
            className="shrink-0"
          >
            <Plus className="size-3.5" />
            Add Provider
          </Button>
        </div>

        {error || actionError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{actionError ?? error}</p>
          </div>
        ) : null}

        {providers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No direct providers configured. AI Gateway can still be used when
            its credentials are configured.
          </div>
        ) : (
          <div className="space-y-2">
            {providers.map((provider) => (
              <div
                key={provider.providerId}
                className="group flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3.5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70">
                    <Boxes className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {provider.displayName}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {provider.providerId} · {provider.baseUrl}
                    </p>
                    {provider.hasApiKey ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <KeyRound className="size-3" /> Key stored
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditingProviderId(provider.providerId);
                      setActionError(null);
                      setDialogOpen(true);
                    }}
                    disabled={isSaving}
                  >
                    <Pencil className="size-3.5" />
                    <span className="sr-only">Edit {provider.displayName}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => {
                      if (!window.confirm(`Delete ${provider.displayName}?`)) {
                        return;
                      }

                      setIsSaving(true);
                      setActionError(null);
                      try {
                        await removeProvider(provider.providerId);
                      } catch (removeError) {
                        setActionError(
                          removeError instanceof Error
                            ? removeError.message
                            : "Failed to delete model provider",
                        );
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">
                      Delete {provider.displayName}
                    </span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialValue={editingProvider}
        isSaving={isSaving}
        onSubmit={async (provider) => {
          setIsSaving(true);
          try {
            await saveProvider(provider);
            return true;
          } catch (saveError) {
            return saveError instanceof Error
              ? saveError.message
              : "Failed to save model provider";
          } finally {
            setIsSaving(false);
          }
        }}
      />
    </>
  );
}
