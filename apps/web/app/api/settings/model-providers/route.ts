import { z } from "zod";
import {
  deleteModelProvider,
  DirectModelProvidersDisabledError,
  getModelProvidersForSettings,
  normalizeBaseUrl,
  normalizeProviderId,
  upsertModelProvider,
} from "@/lib/db/model-providers";
import { isDirectModelProvidersEnabled } from "@/lib/model-provider-access";
import { getServerSession } from "@/lib/session/get-server-session";

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  })
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  });

const providerInputSchema = z.object({
  providerId: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(80),
  baseUrl: httpUrlSchema,
  apiKey: z.string().trim().max(8192).optional(),
});

const deleteProviderInputSchema = z.object({
  providerId: z.string().trim().min(1).max(50),
});

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function GET() {
  if (!isDirectModelProvidersEnabled()) {
    return jsonError("Not found", 404);
  }

  const session = await getServerSession();
  if (!session?.user) {
    return jsonError("Not authenticated", 401);
  }

  const providers = await getModelProvidersForSettings(session.user.id);
  return Response.json({ providers });
}

export async function POST(req: Request) {
  if (!isDirectModelProvidersEnabled()) {
    return jsonError("Not found", 404);
  }

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

  const providerId = normalizeProviderId(parsedBody.data.providerId);
  if (!providerId) {
    return jsonError("Provider ID must contain letters or numbers", 400);
  }

  try {
    const provider = await upsertModelProvider(session.user.id, {
      providerId,
      displayName: parsedBody.data.displayName,
      baseUrl: normalizeBaseUrl(parsedBody.data.baseUrl),
      ...(parsedBody.data.apiKey !== undefined
        ? { apiKey: parsedBody.data.apiKey }
        : {}),
    });
    const providers = await getModelProvidersForSettings(session.user.id);

    return Response.json({ provider, providers });
  } catch (error) {
    if (error instanceof DirectModelProvidersDisabledError) {
      return jsonError("Not found", 404);
    }

    console.error("Failed to save model provider:", error);
    return jsonError("Failed to save model provider", 500);
  }
}

export async function DELETE(req: Request) {
  if (!isDirectModelProvidersEnabled()) {
    return jsonError("Not found", 404);
  }

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
    if (error instanceof DirectModelProvidersDisabledError) {
      return jsonError("Not found", 404);
    }

    console.error("Failed to delete model provider:", error);
    return jsonError("Failed to delete model provider", 500);
  }
}
