"use client";

import type { WebAgentMessageMetadata } from "@/app/types";
import type { ModelOption } from "@/lib/model-options";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageModelPillProps {
  metadata: WebAgentMessageMetadata;
  modelOptions: ModelOption[];
}

export function MessageModelPill({
  metadata,
  modelOptions,
}: MessageModelPillProps) {
  const { selectedModelId, modelId: resolvedModelId } = metadata;

  if (!selectedModelId && !resolvedModelId) {
    return null;
  }

  const selectedOption = selectedModelId
    ? modelOptions.find((option) => option.id === selectedModelId)
    : undefined;
  const resolvedOption = resolvedModelId
    ? modelOptions.find((option) => option.id === resolvedModelId)
    : undefined;

  const displayLabel =
    selectedOption?.label ??
    resolvedOption?.label ??
    selectedModelId ??
    resolvedModelId;

  if (!displayLabel) {
    return null;
  }

  const showResolvedModelTooltip =
    selectedOption?.isVariant === true &&
    resolvedModelId !== undefined &&
    resolvedModelId !== selectedModelId;

  const tooltipText = showResolvedModelTooltip
    ? (resolvedOption?.label ?? resolvedModelId)
    : undefined;

  const pill = (
    <span className="inline-flex max-w-[240px] items-center rounded px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground/50 transition-colors hover:text-muted-foreground/80">
      <span className="truncate">{displayLabel}</span>
    </span>
  );

  if (!tooltipText) {
    return pill;
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent side="top" align="start">
        <span className="text-xs">{tooltipText}</span>
      </TooltipContent>
    </Tooltip>
  );
}
