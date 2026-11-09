# vPeople - Vendasta HR Platform

vPeople is Vendasta's internal HR management system, built to replace BambooHR. It provides employee directory, org chart, time-off management, onboarding/offboarding workflows, and a BambooHR-compatible API for legacy integrations.

## Features

### v1 Scope (Completed)

- **People Directory**: Searchable employee directory with detailed profiles
- **Employee Profiles**: Comprehensive employee information across multiple tabs:
  - Personal information (contact, address, demographics)
  - Job information (title, department, location, job history)
  - Compensation (protected fields with role-based access)
  - Time off balances and requests
  - Emergency contacts
  - Onboarding/offboarding tasks
- **Org Chart**: Visual organization hierarchy showing reporting structure
- **Seats (Accountability Chart)**: VOS-style accountability chart with:
  - Seat hierarchy
  - Accountabilities per seat
  - Assigned employees
  - Open positions
  - Integration boundary for future VOS sync
- **Time Off Management**:
  - Multiple policies by country (Canada, US, India)
  - Accrual tracking
  - Balance management
  - Request and approval workflow
- **Onboarding/Offboarding**: Task management with templates and checklists
- **Admin Panel**: Department, division, team, and location management
- **BambooHR-Compatible API**: Read-only API shim for legacy integrations

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS with Radix UI components
- **Database**: PostgreSQL (Neon/Vercel Postgres) via Drizzle ORM
- **Authentication**: NextAuth.js v5 with Google OAuth (restricted to @vendasta.com)
- **Deployment**: Vercel-ready with one-click deploy

## Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (local or Neon/Vercel Postgres)
- Google OAuth credentials (for production) or dev auth bypass

### Local Development

1. Clone the repository:

```bash
git clone <your-repo-url>
cd vpeople
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
# Database (required)
DATABASE_URL=postgresql://user:password@localhost:5432/vpeople

# Auth (for production; optional for dev)
AUTH_SECRET=your-secret-key-here  # Generate with: openssl rand -base64 32
AUTH_GOOGLE_ID=your-google-oauth-client-id
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret
AUTH_URL=http://localhost:3000

# For development only (bypass Google OAuth)
ENABLE_DEV_AUTH=true

# Bamboo API Gateway (comma-separated API keys)
BAMBOO_API_KEYS=test-api-key-1,test-api-key-2
```

4. Generate and run database migrations:

```bash
npm run db:generate
npm run db:migrate
```

5. Seed the database with demo data:

```bash
npm run db:seed
```

This creates ~85 employees, departments, time-off policies, and sample data.

6. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

7. Sign in:
   - With `ENABLE_DEV_AUTH=true`: use any `@vendasta.com` email (e.g., `brendan.king@vendasta.com`)
   - With Google OAuth: sign in with your Vendasta Google account

### Database Management

View and edit data with Drizzle Studio:

```bash
npm run db:studio
```

This opens a web UI at `https://local.drizzle.studio`.

## Deployment to Vercel

### 1. Database Setup

Create a Postgres database:

**Option A: Neon (Recommended)**
1. Go to [https://neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string

**Option B: Vercel Postgres**
1. In your Vercel project dashboard, go to Storage
2. Create a new Postgres database
3. Copy the `POSTGRES_URL` connection string

### 2. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Add authorized redirect URIs:
   - `https://your-domain.vercel.app/api/auth/callback/google`
6. Copy Client ID and Client Secret

### 3. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=<your-repo-url>)

Or manually:

```bash
npm install -g vercel
vercel
```

### 4. Configure Environment Variables

In Vercel project settings → Environment Variables, add:

```
DATABASE_URL=<your-postgres-connection-string>
AUTH_SECRET=<generate-with-openssl-rand-base64-32>
AUTH_GOOGLE_ID=<your-google-client-id>
AUTH_GOOGLE_SECRET=<your-google-client-secret>
AUTH_URL=https://your-domain.vercel.app
BAMBOO_API_KEYS=<your-api-keys-comma-separated>
SEED_TOKEN=<secure-random-string-for-seed-api>
```

### 5. Run Migrations

After first deploy, run migrations:

```bash
# Using Vercel CLI
vercel env pull .env.local
npm run db:migrate

# Or connect directly to your database and run migrations
```

### 6. Seed Data

You have two options to seed the database:

**Option A: Using the Seed API (Recommended for Production)**

1. Set the `SEED_TOKEN` environment variable in Vercel to a secure random string
2. After deployment, trigger the seed via API:

```bash
curl -X POST https://your-domain.vercel.app/api/admin/seed \
  -H "Content-Type: application/json" \
  -H "X-Seed-Token: YOUR_SEED_TOKEN_HERE"
```

To reset and re-seed (⚠️ destructive, deletes all data):

```bash
curl -X POST https://your-domain.vercel.app/api/admin/seed \
  -H "Content-Type: application/json" \
  -H "X-Seed-Token: YOUR_SEED_TOKEN_HERE" \
  -d '{"reset": true}'
```

**Option B: Using Local Shell**

```bash
# Connect to your database
vercel env pull .env.local
npm run db:seed

# Or reset and re-seed
npm run db:seed -- --reset
```

Your app is now live at `https://your-domain.vercel.app`!

### Seed API Security

The `/api/admin/seed` endpoint:
- Requires a secret `X-Seed-Token` header matching the `SEED_TOKEN` environment variable
- Returns 404 when `SEED_TOKEN` is not configured
- Is safe to call multiple times (idempotent unless `--reset` is used)
- Supports `{"reset": true}` in request body to truncate tables before seeding
- Should only be used in trusted environments (never expose the token)

## Role-Based Access Control

vPeople implements role-based access with the following levels:

- **Employee**: View own profile and public directory
- **Manager**: View direct reports and approve their time-off requests
- **Regional View**: View employees in a specific region
- **Global View**: View all employees across the organization
- **Full Admin**: Full access to all data and settings

### Protected Fields

Compensation, SIN/SSN, and bank details are protected and only visible to:
- The employee themselves
- Their direct manager
- Full admins

## Bamboo API Compatibility

vPeople provides a read-only API compatible with BambooHR integrations. See [API.md](./API.md) for full documentation.

**Example:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.vercel.app/api/gateway/v1/vendasta/employees/directory
```

## Testing

Run tests:

```bash
npm test

# Watch mode
npm run test:watch
```

Tests cover:
- API key validation
- Employee data formatting
- Utility functions
- Permission checks

## Project Structure

```
vpeople/
├── app/
│   ├── (dashboard)/        # Authenticated app pages
│   │   ├── people/         # Directory & profiles
│   │   ├── org-chart/      # Organization chart
│   │   ├── seats/          # Accountability chart
│   │   ├── time-off/       # Time off management
│   │   ├── tasks/          # Onboarding/offboarding
│   │   └── admin/          # Admin panel
│   ├── api/
│   │   └── gateway/v1/     # Bamboo-compatible API
│   ├── auth/               # Sign in pages
│   └── globals.css
├── components/
│   ├── ui/                 # Reusable UI components
│   └── nav.tsx             # Navigation
├── lib/
│   ├── db/                 # Database schema & connection
│   │   ├── schema.ts       # Drizzle schema
│   │   └── index.ts        # DB client
│   ├── auth.ts             # NextAuth config
│   ├── bamboo-api.ts       # Bamboo API utilities
│   └── utils.ts            # Helper functions
├── scripts/
│   ├── migrate.ts          # Migration runner
│   └── seed.ts             # Seed data generator
├── __tests__/              # Jest tests
└── drizzle/                # Generated migrations
```

## Seed Data

The seed script creates:
- **1 CEO**: Brendan King
- **4 Executives**: CPO, CTO, VP Sales, Director of Engineering
- **~80 Employees**: across Technology, Sales, Marketing, Product, Services, and People Ops
- **7 Departments**, **5 Divisions**, **4 Teams**, **5 Locations**
- **6 Seats** in the accountability chart (1 open position)
- **6 Time-off Policies** for Canada, US, and India
- **Time-off balances** for all employees
- **Sample time-off requests** (some pending, some approved)
- **Onboarding tasks** for 5 new hires

All employee data uses realistic fake names and information.

## What's Stubbed for v2

The following features are stubbed or partially implemented for future development:

- **Write operations in Bamboo API** (POST/PUT/DELETE)
- **Document management** (placeholder tab exists)
- **Benefits enrollment** (basic structure exists)
- **Training/LMS** (basic structure exists)
- **Hiring/ATS** (not included in v1)
- **Performance reviews** (VOS integration planned)
- **Real-time VOS seat sync** (integration boundary created)
- **BambooHR data import** (currently uses seed data only)
- **Advanced reporting** (basic reports implemented)
- **Webhooks** (not implemented)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes (prod) | NextAuth secret key |
| `AUTH_VENDASTA_ID` | Yes (SSO) | Dedicated Vendasta OIDC client ID |
| `AUTH_VENDASTA_SECRET` | Yes (SSO) | Dedicated Vendasta OIDC client secret |
| `AUTH_VENDASTA_PARTNER_ID` | No | Set to `vuni` only if IAM requires a partner namespace on authorize. Not `account_id`. Leave unset otherwise. |
| `AUTH_GOOGLE_ID` | No | Leftover Google provider; not the vPeople SSO path |
| `AUTH_GOOGLE_SECRET` | No | Leftover Google provider; not the vPeople SSO path |
| `AUTH_URL` | Yes (prod) | Public app URL |
| `ENABLE_DEV_AUTH` | No | Set to `true` to enable dev login bypass |
| `BAMBOO_API_KEYS` | Yes | Comma-separated list of valid API keys |
| `SEED_TOKEN` | No | Secret token for `/api/admin/seed` endpoint (disables endpoint if unset) |

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Run linter: `npm run lint`
5. Commit and push
6. Open a pull request

## License

Internal use only - Vendasta Technologies Inc.

## Support

For questions or issues, contact the People Operations team or file an issue in this repository.
