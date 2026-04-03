import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { workspaces } from "./workspaces";

export const workspaceStorageConfigs = pgTable(
  "workspace_storage_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(), // 's3' | 'r2' | 'vercel'
    bucket: varchar("bucket", { length: 255 }).notNull(),
    region: varchar("region", { length: 50 }),
    endpoint: text("endpoint"), // Custom endpoint for S3-compatible / R2
    encryptedCredentials: text("encrypted_credentials").notNull(), // AES-256-GCM encrypted JSON
    isActive: boolean("is_active").notNull().default(true),
    lastTestedAt: timestamp("last_tested_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_storage_configs_workspace_id_idx").on(
      table.workspaceId,
    ),
  ],
);

export const workspaceStorageConfigsRelations = relations(
  workspaceStorageConfigs,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceStorageConfigs.workspaceId],
      references: [workspaces.id],
    }),
  }),
);
