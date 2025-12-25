CREATE TYPE "Role" AS ENUM('ADMIN', 'USER');--> statement-breakpoint
CREATE TABLE "Category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"published" boolean DEFAULT false NOT NULL,
	"title" text DEFAULT 'New Post' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"authorId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"publishedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PostToCategory" (
	"postId" uuid,
	"categoryId" uuid,
	CONSTRAINT "PostToCategory_pkey" PRIMARY KEY("postId","categoryId")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"name" text DEFAULT 'User' NOT NULL,
	"roles" "Role"[] DEFAULT '{USER}'::"Role"[] NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_User_id_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_postId_Post_id_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "PostToCategory" ADD CONSTRAINT "PostToCategory_categoryId_Category_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE;