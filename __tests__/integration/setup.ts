// Load environment variables for integration tests
import { config } from 'dotenv';
import { resolve, join } from 'path';

// Load from .env.local in workspace root
const envPath = join(__dirname, '../../.env.local');
const result = config({ path: envPath });

if (result.error) {
  console.error('Failed to load .env.local:', result.error);
} else {
  console.log('Loaded environment from:', envPath);
}
