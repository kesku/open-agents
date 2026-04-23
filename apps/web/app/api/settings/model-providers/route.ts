import { z } from "zod";
import {
  deleteModelProvider,
  getModelProvidersForSettings,
  upsertModelProvider,
} from "@/lib/db/model-providers";
import { getServerSession } from "@/lib/session/get-server-session";

const providerInputSchema = z.object({
  providerId: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(80),
  baseUrl: z.string().url(),
  apiKey: z.string().trim().min(1),
});

const deleteProviderInputSchema = z.object({
  providerId: z.string().trim().min(1).max(50),
});
const RESERVED_PROVIDER_IDS = new Set(["openai"]);

function normalizeProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return jsonError("Not authenticated", 401);
  }

  const providers = await getModelProvidersForSettings(session.user.id);
  return Response.json({ providers });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return jsonError("Not authenticated", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsedBody = providerInputSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError("Invalid model provider payload", 400);
  }

  const normalizedProviderId = normalizeProviderId(parsedBody.data.providerId);
  if (RESERVED_PROVIDER_IDS.has(normalizedProviderId)) {
    return jsonError("That provider id is reserved", 400);
  }

  try {
    const provider = await upsertModelProvider(session.user.id, {
      providerId: normalizedProviderId,
      displayName: parsedBody.data.displayName.trim(),
      baseUrl: normalizeBaseUrl(parsedBody.data.baseUrl),
      apiKey: parsedBody.data.apiKey.trim(),
    });

    const providers = await getModelProvidersForSettings(session.user.id);
    return Response.json({ provider, providers });
  } catch (error) {
    console.error("Failed to save model provider:", error);
    return jsonError("Failed to save model provider", 500);
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return jsonError("Not authenticated", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsedBody = deleteProviderInputSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError("Invalid model provider payload", 400);
  }

  try {
    const deleted = await deleteModelProvider(
      session.user.id,
      parsedBody.data.providerId,
    );
    if (!deleted) {
      return jsonError("Model provider not found", 404);
    }

    const providers = await getModelProvidersForSettings(session.user.id);
    return Response.json({ providers });
  } catch (error) {
    console.error("Failed to delete model provider:", error);
    return jsonError("Failed to delete model provider", 500);
  }
}
