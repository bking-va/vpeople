// Load environment variables for integration tests
import { config } from 'dotenv';
import { resolve, join } from 'path';

// Load from .env.local in workspace root
const envPath = join(__dirname, '../../.env.local');
const result = config({ path: envPath, quiet: true });

if (result.error) {
  // GitHub Actions sets DATABASE_URL in the job env; .env.local is local-only.
  if (!process.env.DATABASE_URL) {
    console.error("Failed to load .env.local and DATABASE_URL is unset:", result.error);
  }
} else {
  console.log("Loaded environment from:", envPath);
}
