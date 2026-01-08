// CommonJS drizzle config for production migrations
// This file is used by docker-entrypoint.sh to run migrations without TypeScript loaders

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for migrations");
}

module.exports = {
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
