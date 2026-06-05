CREATE TABLE "sso_verified_domain" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"verification_token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"enforced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_identified_session" (
	"session_id" text PRIMARY KEY NOT NULL,
	"hmac_verified" boolean NOT NULL,
	"identified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_origin_session" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_mentions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_flags" (
	"chat_message_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"flagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_flags_chat_message_id_principal_id_pk" PRIMARY KEY("chat_message_id","principal_id")
);
--> statement-breakpoint
CREATE TABLE "chat_message_mentions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_message_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_reactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_message_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"principal_id" uuid,
	"sender_type" text NOT NULL,
	"content" text NOT NULL,
	"content_json" jsonb,
	"is_internal" boolean DEFAULT false NOT NULL,
	"attachments" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by_principal_id" uuid
);
--> statement-breakpoint
CREATE TABLE "chat_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chat_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "conversation_tags" (
	"conversation_id" uuid NOT NULL,
	"chat_tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_principal_id" uuid NOT NULL,
	"assigned_agent_principal_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"channel" text DEFAULT 'live_chat' NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"subject" text,
	"last_message_preview" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visitor_last_read_at" timestamp with time zone,
	"agent_last_read_at" timestamp with time zone,
	"csat_rating" integer,
	"csat_comment" text,
	"csat_submitted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"visitor_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hook_deliveries" (
	"job_id" text PRIMARY KEY NOT NULL,
	"hook_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"actor_role" text,
	"actor_ip" text,
	"actor_user_agent" text,
	"request_id" text,
	"actor_type" text,
	"auth_method" text,
	"event_type" text NOT NULL,
	"event_outcome" text DEFAULT 'success' NOT NULL,
	"target_type" text,
	"target_id" text,
	"before_value" jsonb,
	"after_value" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "sso_recovery_code" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "boards_is_public_idx";--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "kind" text DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "principal" ADD COLUMN "last_sso_sign_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "principal" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "principal" ADD COLUMN "chat_availability" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "managed_field_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "auth_config_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "access" jsonb DEFAULT '{"view":"anonymous","vote":"anonymous","comment":"anonymous","submit":"anonymous","segments":{"view":[],"vote":[],"comment":[],"submit":[]},"moderation":{"anonPosts":"inherit","signedPosts":"inherit","comments":"inherit"}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_edit_history" ADD COLUMN "previous_content_json" jsonb;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "content_json" jsonb;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "moderation_state" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_flags" ADD CONSTRAINT "chat_message_flags_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_flags" ADD CONSTRAINT "chat_message_flags_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_mentions" ADD CONSTRAINT "chat_message_mentions_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_principal_id_principal_id_fk" FOREIGN KEY ("deleted_by_principal_id") REFERENCES "public"."principal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_chat_tag_id_chat_tags_id_fk" FOREIGN KEY ("chat_tag_id") REFERENCES "public"."chat_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_visitor_principal_id_principal_id_fk" FOREIGN KEY ("visitor_principal_id") REFERENCES "public"."principal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_agent_principal_id_principal_id_fk" FOREIGN KEY ("assigned_agent_principal_id") REFERENCES "public"."principal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_recovery_code" ADD CONSTRAINT "sso_recovery_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sso_verified_domain_name_unique" ON "sso_verified_domain" USING btree ("name");--> statement-breakpoint
CREATE INDEX "widget_origin_session_user_id_idx" ON "widget_origin_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_mentions_post_principal_uq" ON "post_mentions" USING btree ("post_id","principal_id");--> statement-breakpoint
CREATE INDEX "post_mentions_principal_idx" ON "post_mentions" USING btree ("principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_message_flags_principal_idx" ON "chat_message_flags" USING btree ("principal_id","flagged_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_mentions_message_principal_uq" ON "chat_message_mentions" USING btree ("chat_message_id","principal_id");--> statement-breakpoint
CREATE INDEX "chat_message_mentions_principal_idx" ON "chat_message_mentions" USING btree ("principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_message_reactions_message_idx" ON "chat_message_reactions" USING btree ("chat_message_id");--> statement-breakpoint
CREATE INDEX "chat_message_reactions_principal_idx" ON "chat_message_reactions" USING btree ("principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_reactions_unique_idx" ON "chat_message_reactions" USING btree ("chat_message_id","principal_id","emoji");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "chat_messages_principal_idx" ON "chat_messages" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_tags_deleted_at_idx" ON "chat_tags" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_tags_pk" ON "conversation_tags" USING btree ("conversation_id","chat_tag_id");--> statement-breakpoint
CREATE INDEX "conversation_tags_chat_tag_idx" ON "conversation_tags" USING btree ("chat_tag_id");--> statement-breakpoint
CREATE INDEX "conversations_status_last_message_idx" ON "conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_visitor_principal_idx" ON "conversations" USING btree ("visitor_principal_id");--> statement-breakpoint
CREATE INDEX "conversations_assigned_agent_idx" ON "conversations" USING btree ("assigned_agent_principal_id");--> statement-breakpoint
CREATE INDEX "hook_deliveries_processed_at_idx" ON "hook_deliveries" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_occurred_at_idx" ON "audit_log" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_event_type_occurred_at_idx" ON "audit_log" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_request_id_idx" ON "audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "sso_recovery_code_user_id_idx" ON "sso_recovery_code" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_recovery_code_active_hash_unique" ON "sso_recovery_code" USING btree ("user_id","code_hash") WHERE used_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_token_idx" ON "push_devices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_devices_principal_idx" ON "push_devices" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "account_userId_createdAt_idx" ON "account" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_email_kind_status_idx" ON "invitation" USING btree ("email","kind","status");--> statement-breakpoint
CREATE INDEX "invitation_pending_expires_idx" ON "invitation" USING btree ("kind","expires_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "principal_contact_email_idx" ON "principal" USING btree ("contact_email") WHERE contact_email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "session_userId_createdAt_idx" ON "session" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_email_lower_idx" ON "user" USING btree (LOWER("email")) WHERE email IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_external_id_idx" ON "user" USING btree ("external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_country_idx" ON "user" USING btree ("country") WHERE country IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_locale_idx" ON "user" USING btree ("locale") WHERE locale IS NOT NULL;--> statement-breakpoint
CREATE INDEX "comments_moderation_state_idx" ON "comments" USING btree ("moderation_state");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_slug_unique" ON "segments" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "boards" DROP COLUMN "is_public";