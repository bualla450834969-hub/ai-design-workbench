import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["student", "admin"]);
export const messageRole = pgEnum("message_role", ["user", "assistant", "system"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "cancelled"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  name: text("name").notNull().default("新同学"),
  role: userRole("role").notNull().default("student"),
  disabled: boolean("disabled").notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex("users_phone_unique").on(table.phone)]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  activeAgentId: text("active_agent_id").notNull().default("appearance-variants"),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
}, (table) => [index("projects_user_idx").on(table.userId)]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  agentId: text("agent_id").notNull(),
  title: text("title").notNull().default("新对话"),
  ...timestamps,
}, (table) => [index("conversations_project_idx").on(table.projectId)]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
  role: messageRole("role").notNull(),
  content: text("content").notNull(),
  agentId: text("agent_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("messages_conversation_idx").on(table.conversationId)]);

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  role: text("role").notNull(),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("assets_project_idx").on(table.projectId)]);

export const agentDefinitions = pgTable("agent_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  publishedVersionId: uuid("published_version_id"),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

export const agentVersions = pgTable("agent_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: text("agent_id").notNull().references(() => agentDefinitions.id),
  version: text("version").notNull(),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
  promptSource: text("prompt_source").notNull().default(""),
  published: boolean("published").notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex("agent_version_unique").on(table.agentId, table.version)]);

export const modelRoutes = pgTable("model_routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: text("agent_id").notNull().references(() => agentDefinitions.id),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  priority: integer("priority").notNull().default(0),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  agentId: text("agent_id").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  prompt: text("prompt").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  idempotencyKey: text("idempotency_key").notNull(),
  error: text("error"),
  ...timestamps,
}, (table) => [uniqueIndex("jobs_idempotency_unique").on(table.userId, table.idempotencyKey), index("jobs_status_idx").on(table.status)]);

export const generationResults = pgTable("generation_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => generationJobs.id),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
  prompt: text("prompt").notNull(),
  quality: jsonb("quality").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("results_job_unique").on(table.jobId)]);

export const feedback = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  jobId: uuid("job_id").notNull().references(() => generationJobs.id),
  rating: integer("rating").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
