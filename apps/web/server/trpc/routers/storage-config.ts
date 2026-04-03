import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, workspaceAdminProcedure } from "../init";
import { workspaceStorageConfigs } from "@openstore/database";
import { encryptSecret, decryptSecret } from "../../s3/auth";
import {
  createStorageFromConfig,
  type WorkspaceStorageConfig,
} from "@openstore/storage";

const s3CredentialsSchema = z.object({
  provider: z.literal("s3"),
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
});

const r2CredentialsSchema = z.object({
  provider: z.literal("r2"),
  accountId: z.string().min(1, "Account ID is required"),
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
});

const vercelCredentialsSchema = z.object({
  provider: z.literal("vercel"),
  readWriteToken: z.string().min(1, "Read/Write Token is required"),
});

const credentialsSchema = z.discriminatedUnion("provider", [
  s3CredentialsSchema,
  r2CredentialsSchema,
  vercelCredentialsSchema,
]);

const saveConfigSchema = z
  .object({
    provider: z.enum(["s3", "r2", "vercel"]),
    bucket: z.string().min(1, "Bucket name is required"),
    region: z.string().optional(),
    endpoint: z.string().optional(),
    credentials: credentialsSchema,
  })
  .refine((data) => data.credentials.provider === data.provider, {
    message: "Credentials provider must match the selected provider",
    path: ["credentials"],
  });

export const storageConfigRouter = createRouter({
  get: workspaceAdminProcedure.query(async ({ ctx }) => {
    const [config] = await ctx.db
      .select({
        id: workspaceStorageConfigs.id,
        provider: workspaceStorageConfigs.provider,
        bucket: workspaceStorageConfigs.bucket,
        region: workspaceStorageConfigs.region,
        endpoint: workspaceStorageConfigs.endpoint,
        isActive: workspaceStorageConfigs.isActive,
        lastTestedAt: workspaceStorageConfigs.lastTestedAt,
        createdAt: workspaceStorageConfigs.createdAt,
        updatedAt: workspaceStorageConfigs.updatedAt,
      })
      .from(workspaceStorageConfigs)
      .where(eq(workspaceStorageConfigs.workspaceId, ctx.workspaceId));

    if (!config) return null;

    // Return config without credentials (never expose secrets)
    return config;
  }),

  save: workspaceAdminProcedure
    .input(saveConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const encryptedCredentials = encryptSecret(
        JSON.stringify(input.credentials),
      );

      const [existing] = await ctx.db
        .select({ id: workspaceStorageConfigs.id })
        .from(workspaceStorageConfigs)
        .where(eq(workspaceStorageConfigs.workspaceId, ctx.workspaceId));

      if (existing) {
        const [updated] = await ctx.db
          .update(workspaceStorageConfigs)
          .set({
            provider: input.provider,
            bucket: input.bucket,
            region: input.region ?? null,
            endpoint: input.endpoint ?? null,
            encryptedCredentials,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(workspaceStorageConfigs.workspaceId, ctx.workspaceId))
          .returning({
            id: workspaceStorageConfigs.id,
            provider: workspaceStorageConfigs.provider,
            bucket: workspaceStorageConfigs.bucket,
            region: workspaceStorageConfigs.region,
            endpoint: workspaceStorageConfigs.endpoint,
            isActive: workspaceStorageConfigs.isActive,
          });

        return updated;
      }

      const [created] = await ctx.db
        .insert(workspaceStorageConfigs)
        .values({
          workspaceId: ctx.workspaceId,
          provider: input.provider,
          bucket: input.bucket,
          region: input.region ?? null,
          endpoint: input.endpoint ?? null,
          encryptedCredentials,
          isActive: true,
        })
        .returning({
          id: workspaceStorageConfigs.id,
          provider: workspaceStorageConfigs.provider,
          bucket: workspaceStorageConfigs.bucket,
          region: workspaceStorageConfigs.region,
          endpoint: workspaceStorageConfigs.endpoint,
          isActive: workspaceStorageConfigs.isActive,
        });

      return created;
    }),

  remove: workspaceAdminProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(workspaceStorageConfigs)
      .where(eq(workspaceStorageConfigs.workspaceId, ctx.workspaceId));

    return { success: true };
  }),

  test: workspaceAdminProcedure
    .input(saveConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const config: WorkspaceStorageConfig = {
        provider: input.provider,
        bucket: input.bucket,
        region: input.region,
        endpoint: input.endpoint,
        credentials: input.credentials,
      };

      try {
        const storage = createStorageFromConfig(config);

        // Try a simple existence check on a test key to validate credentials
        const testPath = `.openstore-connection-test-${Date.now()}`;
        const testData = Buffer.from("connection-test");

        await storage.upload({
          path: testPath,
          data: testData,
          contentType: "text/plain",
        });

        // Clean up the test file
        await storage.delete(testPath);

        // Update last tested timestamp if config is already saved
        await ctx.db
          .update(workspaceStorageConfigs)
          .set({ lastTestedAt: new Date() })
          .where(eq(workspaceStorageConfigs.workspaceId, ctx.workspaceId));

        return { success: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Connection failed: ${(err as Error).message}`,
        });
      }
    }),
});
