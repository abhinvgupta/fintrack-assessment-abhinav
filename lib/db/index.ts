import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

// Stub: replace with real connection string from env
export const db = drizzle(process.env.DATABASE_URL!, { schema })
