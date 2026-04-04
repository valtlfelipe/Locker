import type { StorageProvider } from "./interface";
import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import type { S3StorageConfig } from "./s3";
import { R2StorageAdapter } from "./r2";
import type { R2StorageConfig } from "./r2";
import { VercelBlobAdapter } from "./vercel";
import { verifyLocalFileSignature } from "./local-signing";

import type { VercelBlobConfig } from "./vercel";

export type {
  StorageProvider,
  S3StorageConfig,
  R2StorageConfig,
  VercelBlobConfig,
};
export {
  LocalStorageAdapter,
  S3StorageAdapter,
  R2StorageAdapter,
  VercelBlobAdapter,
};
export { verifyLocalFileSignature };

export function createStorage(): StorageProvider {
  switch (process.env.BLOB_STORAGE_PROVIDER) {
    case "s3":
      return new S3StorageAdapter();
    case "r2":
      return new R2StorageAdapter();
    case "vercel":
      return new VercelBlobAdapter();
    case "local":
    default:
      return new LocalStorageAdapter();
  }
}

/**
 * Credential shapes expected per provider (stored as encrypted JSON).
 */
export type StorageCredentials =
  | { provider: "s3"; accessKeyId: string; secretAccessKey: string }
  | {
      provider: "r2";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  | { provider: "vercel"; readWriteToken: string };

export interface WorkspaceStorageConfig {
  provider: "s3" | "r2" | "vercel";
  bucket: string;
  region?: string | null;
  endpoint?: string | null;
  credentials: StorageCredentials;
}

/**
 * Create a storage adapter from a workspace's custom config.
 * Falls back to the default (env-var) storage when no config is provided.
 */
export function createStorageFromConfig(
  config: WorkspaceStorageConfig,
): StorageProvider {
  const creds = config.credentials;
  switch (creds.provider) {
    case "s3":
      return new S3StorageAdapter({
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        bucket: config.bucket,
        region: config.region ?? undefined,
        endpoint: config.endpoint ?? undefined,
      });
    case "r2":
      return new R2StorageAdapter({
        accountId: creds.accountId,
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        bucket: config.bucket,
        publicUrl: undefined,
      });
    case "vercel":
      return new VercelBlobAdapter({
        token: creds.readWriteToken,
      });
    default:
      return createStorage();
  }
}
