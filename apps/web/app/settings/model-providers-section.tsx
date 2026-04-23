"use client";

import { useEffect, useState } from "react";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { useModelProviders } from "@/hooks/use-model-providers";
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

type DraftProvider = {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
};

const EMPTY_DRAFT: DraftProvider = {
  providerId: "",
  displayName: "",
  baseUrl: "",
  apiKey: "",
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
  initialValue: DraftProvider | null;
  isSaving: boolean;
  onSubmit: (provider: DraftProvider) => Promise<true | string>;
}) {
  const [draft, setDraft] = useState<DraftProvider>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(initialValue ?? EMPTY_DRAFT);
    setError(null);
  }, [initialValue, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const result = await onSubmit({
      providerId: draft.providerId.trim(),
      displayName: draft.displayName.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
    });

    if (result === true) {
      onOpenChange(false);
      return;
    }

    setError(result);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initialValue ? "Edit Provider" : "Add Provider"}
          </DialogTitle>
          <DialogDescription>
            Add any OpenAI-compatible provider with a `/models` endpoint, like
            OpenRouter or a self-hosted gateway.
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
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Used in model ids, e.g.{" "}
              <code>openrouter/google/gemini-2.5-pro</code>.
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
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              value={draft.baseUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
              placeholder="https://openrouter.ai/api/v1"
              disabled={isSaving}
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
              placeholder="sk-or-..."
              disabled={isSaving}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {initialValue ? "Save Provider" : "Add Provider"}
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
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ModelProvidersSection() {
  const { providers, loading, saveProvider, removeProvider } =
    useModelProviders();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const editingProvider =
    providers.find((provider) => provider.providerId === editingProviderId) ??
    null;

  if (loading) {
    return <ModelProvidersSectionSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Model Providers</h2>
          <p className="text-sm text-muted-foreground">
            OpenAI is built in. Add other OpenAI-compatible providers here and
            they will show up automatically in the model selector via `/models`.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditingProviderId(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      <div className="rounded-lg border border-border/60">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-3">
          <div>
            <p className="font-medium">OpenAI</p>
            <p className="text-sm text-muted-foreground">
              Built-in provider configured from server environment.
            </p>
          </div>
          <div className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            built in
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No custom providers configured yet.
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.providerId}
              className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{provider.displayName}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  <code>{provider.providerId}</code> ·{" "}
                  <span className="break-all">{provider.baseUrl}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditingProviderId(provider.providerId);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    setIsSaving(true);
                    try {
                      await removeProvider(provider.providerId);
                    } catch (error) {
                      console.error("Failed to delete model provider:", error);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
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
          } catch (error) {
            return error instanceof Error
              ? error.message
              : "Failed to save model provider";
          } finally {
            setIsSaving(false);
          }
        }}
      />
    </div>
  );
}
