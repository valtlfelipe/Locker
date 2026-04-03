import { eq } from "drizzle-orm";
import { getDb } from "@openstore/database/client";
import { workspaceStorageConfigs } from "@openstore/database";
import {
  createStorage,
  createStorageFromConfig,
  type StorageProvider,
  type WorkspaceStorageConfig,
} from "@openstore/storage";
import { decryptSecret } from "./s3/auth";

/**
 * Load the active BYOB config for a workspace, or null if none exists.
 */
async function loadWorkspaceConfig(workspaceId: string) {
  const db = getDb();

  const [config] = await db
    .select({
      provider: workspaceStorageConfigs.provider,
      bucket: workspaceStorageConfigs.bucket,
      region: workspaceStorageConfigs.region,
      endpoint: workspaceStorageConfigs.endpoint,
      encryptedCredentials: workspaceStorageConfigs.encryptedCredentials,
      isActive: workspaceStorageConfigs.isActive,
    })
    .from(workspaceStorageConfigs)
    .where(eq(workspaceStorageConfigs.workspaceId, workspaceId));

  if (!config || !config.isActive) {
    return null;
  }

  const credentials = JSON.parse(decryptSecret(config.encryptedCredentials));

  return {
    provider: config.provider as "s3" | "r2" | "vercel",
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    credentials,
  } satisfies WorkspaceStorageConfig;
}

/**
 * Create a storage adapter for **new uploads** to a workspace.
 * Uses the workspace's custom storage config if one exists and is active,
 * otherwise falls back to the platform default.
 */
export async function createStorageForWorkspace(
  workspaceId: string,
): Promise<StorageProvider> {
  const config = await loadWorkspaceConfig(workspaceId);
  if (!config) return createStorage();
  return createStorageFromConfig(config);
}

/**
 * Create a storage adapter appropriate for accessing an **existing file**.
 *
 * Uses the file's recorded `storageProvider` to decide which backend to use:
 * - If the workspace has an active BYOB config whose provider matches the
 *   file's storageProvider, use that config (the file lives in the BYOB bucket).
 * - Otherwise, fall back to the platform default (the file was stored with the
 *   platform backend, or the BYOB config that created it has since been removed).
 *
 * This prevents provider switches from stranding files: reads/deletes always
 * route to the backend where the file actually lives.
 */
export async function createStorageForFile(
  workspaceId: string,
  fileStorageProvider: string,
): Promise<StorageProvider> {
  const config = await loadWorkspaceConfig(workspaceId);

  // If there's an active BYOB config and the file was stored with that provider,
  // use the BYOB config (the file lives in the custom bucket).
  if (config && config.provider === fileStorageProvider) {
    return createStorageFromConfig(config);
  }

  // Otherwise the file was stored with the platform default backend.
  return createStorage();
}

/**
 * Returns the storage provider name for a workspace.
 * If a custom config is active, returns that provider; otherwise the platform default.
 */
export async function getStorageProviderForWorkspace(
  workspaceId: string,
): Promise<string> {
  const db = getDb();

  const [config] = await db
    .select({
      provider: workspaceStorageConfigs.provider,
      isActive: workspaceStorageConfigs.isActive,
    })
    .from(workspaceStorageConfigs)
    .where(eq(workspaceStorageConfigs.workspaceId, workspaceId));

  if (config?.isActive) {
    return config.provider;
  }

  return process.env.BLOB_STORAGE_PROVIDER ?? "local";
}
