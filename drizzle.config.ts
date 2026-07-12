import { defineConfig } from 'drizzle-kit'

// Drizzle Kit 配置：以 server/db/schema.ts 为模型源，可生成迁移脚本。
// 生成迁移：npx drizzle-kit generate
// 应用迁移（如需）：npx drizzle-kit migrate  （当前运行时已用 CREATE TABLE IF NOT EXISTS 幂等建表）
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: './.data/app.db'
  }
})
