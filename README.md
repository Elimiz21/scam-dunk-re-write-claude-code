# ScamDunk - Stock Scam Red Flag Detector

ScamDunk is a web application that helps retail investors identify potential scam-like red flags in stock pitches they receive. Users enter a stock ticker and the pitch text, and the app analyzes both market data and behavioral patterns to surface potential risks.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Routes](#api-routes)
- [Risk Scoring System](#risk-scoring-system)
- [Authentication](#authentication)
- [Testing](#testing)
- [Deployment](#deployment)

## Features

- **Stock Risk Analysis**: Analyzes stock ticker for structural red flags (penny stocks, low liquidity, OTC exchanges)
- **Price Pattern Detection**: Detects pump-and-dump patterns, price spikes, volume explosions
- **Behavioral Analysis**: NLP-based detection of scam language in pitch text (guaranteed returns, urgency, insider claims)
- **Real Market Data**: Live stock data from Alpha Vantage API with 5-minute caching
- **AI Narratives**: GPT-4 powered explanations of risk signals
- **User Authentication**: Email/password authentication with NextAuth.js v5
- **Usage Limits**: FREE plan (5 checks/month) and PAID plan (200 checks/month)
- **Stripe Integration**: Payment processing for plan upgrades
- **Responsive UI**: Mobile-friendly design with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Authentication**: NextAuth.js v5 (Auth.js)
- **Payments**: Stripe
- **AI/LLM**: OpenAI GPT-4o-mini (for narrative generation)
- **Market Data**: Alpha Vantage API (real-time quotes, company data, price history)
- **Testing**: Jest

## Project Structure

```
scamdunk/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/         # Login page
│   │   │   └── signup/        # Signup page
│   │   ├── (protected)/
│   │   │   ├── account/       # Account management page
│   │   │   └── check/         # Main stock check page
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth routes + register
│   │   │   ├── billing/       # Stripe checkout/portal/webhook
│   │   │   ├── check/         # Main stock analysis endpoint
│   │   │   └── user/usage/    # Usage tracking endpoint
│   │   ├── globals.css        # Global styles + CSS variables
│   │   ├── layout.tsx         # Root layout with SessionProvider
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── LimitReached.tsx   # Limit reached component
│   │   ├── LoadingStepper.tsx # Loading progress component
│   │   └── RiskCard.tsx       # Risk analysis result display
│   ├── lib/
│   │   ├── auth.config.ts     # Edge-compatible auth config
│   │   ├── auth.ts            # Full auth config with providers
│   │   ├── billing.ts         # Stripe integration
│   │   ├── config.ts          # App configuration
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── marketData.ts      # Alpha Vantage API integration
│   │   ├── narrative.ts       # OpenAI narrative generation
│   │   ├── scoring.ts         # Risk scoring engine
│   │   ├── types.ts           # TypeScript types
│   │   ├── usage.ts           # Usage tracking
│   │   └── utils.ts           # Utility functions
│   ├── middleware.ts          # Route protection middleware
│   └── tests/
│       └── scoring.test.ts    # Scoring logic tests
├── .env.example               # Example environment variables
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- PostgreSQL database (or Supabase account)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Elimiz21/scam-dunk-re-write-claude-code.git
   cd scam-dunk-re-write-claude-code
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. Set up the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create a `.env` file with the following variables:

```env
# Database (PostgreSQL/Supabase)
DATABASE_URL="postgresql://user:password@host:5432/database"
DIRECT_URL="postgresql://user:password@host:5432/database"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# OpenAI (for narrative generation)
OPENAI_API_KEY="sk-..."

# Alpha Vantage (for real market data)
ALPHA_VANTAGE_API_KEY="your-key"

# Stripe (for payment processing)
STRIPE_SECRET_KEY="sk_..."
STRIPE_PUBLISHABLE_KEY="pk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_PAID_PLAN_ID="price_..."

# Supabase (optional - for direct access)
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
```

## Database Schema

### User
- `id`: Primary key (cuid)
- `email`: Unique email address
- `hashedPassword`: Bcrypt hashed password
- `name`: Optional display name
- `plan`: "FREE" or "PAID"
- `billingCustomerId`: Stripe customer ID

### ScanUsage
- `id`: Primary key
- `userId`: Foreign key to User
- `monthKey`: Format "YYYY-MM"
- `scanCount`: Number of scans this month
- Unique constraint on (userId, monthKey)

## API Routes

### `POST /api/auth/register`
Register a new user with email/password.

### `POST /api/check`
Main stock analysis endpoint. Requires authentication.

**Request Body:**
```json
{
  "ticker": "ABCD",
  "pitchText": "This stock is going to 10x...",
  "context": {
    "unsolicited": true,
    "promisesHighReturns": false,
    "urgencyPressure": false,
    "secrecyInsideInfo": false
  }
}
```

**Response:**
```json
{
  "riskLevel": "HIGH",
  "totalScore": 9,
  "signals": [...],
  "stockSummary": {...},
  "narrative": {...},
  "usage": {...}
}
```

### `GET /api/user/usage`
Get current user's usage information.

### `POST /api/billing/checkout`
Create Stripe checkout session for upgrade.

### `POST /api/billing/portal`
Create Stripe billing portal session.

## Risk Scoring System

The scoring system is **deterministic** - no LLM is used for scoring, only for generating human-readable narratives.

### Signal Categories

| Category | Signals |
|----------|---------|
| **STRUCTURAL** | MICROCAP_PRICE (price < $5), SMALL_MARKET_CAP (< $300M), MICRO_LIQUIDITY (< $150k/day), OTC_EXCHANGE |
| **PATTERN** | SPIKE_7D (50%+ or 100%+ in 7 days), VOLUME_EXPLOSION (5x or 10x average), SPIKE_THEN_DROP |
| **ALERT** | ALERT_LIST_HIT (regulatory alerts) |
| **BEHAVIORAL** | UNSOLICITED, PROMISED_RETURNS, URGENCY, SECRECY, SPECIFIC_RETURN_CLAIM |

### Risk Levels

- **LOW**: Total score ≤ 2
- **MEDIUM**: Total score 3-6
- **HIGH**: Total score ≥ 7, or ALERT_LIST_HIT
- **INSUFFICIENT**: Large liquid stock on major exchange with no behavioral flags

### Signal Weights

| Signal | Weight |
|--------|--------|
| MICROCAP_PRICE | 2 |
| SMALL_MARKET_CAP | 2 |
| MICRO_LIQUIDITY | 2 |
| OTC_EXCHANGE | 3 |
| SPIKE_7D (50-99%) | 3 |
| SPIKE_7D (100%+) | 4 |
| VOLUME_EXPLOSION (5-9x) | 2 |
| VOLUME_EXPLOSION (10x+) | 3 |
| SPIKE_THEN_DROP | 3 |
| ALERT_LIST_HIT | 5 |
| UNSOLICITED | 1 |
| PROMISED_RETURNS | 2 |
| URGENCY | 2 |
| SECRECY | 2 |
| SPECIFIC_RETURN_CLAIM | 1 |

## Authentication

Authentication uses NextAuth.js v5 with:
- **Credentials Provider**: Email/password login
- **JWT Strategy**: Stateless sessions stored in cookies
- **Plan in Session**: User's plan is included in the session for quick access

The auth system is split into two files:
- `auth.config.ts`: Edge-compatible configuration (used by middleware)
- `auth.ts`: Full configuration with bcryptjs (used by API routes)

## Testing

Run the test suite:
```bash
npm test
```

Tests cover:
- All structural signals (MICROCAP_PRICE, SMALL_MARKET_CAP, etc.)
- All behavioral signals (UNSOLICITED, PROMISED_RETURNS, etc.)
- NLP keyword detection
- Risk level calculation
- Score aggregation
- Edge cases

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Manual Deployment

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

## Contributing

1. Create a feature branch
2. Make changes
3. Run tests: `npm test`
4. Run build: `npm run build`
5. Submit PR

## License

MIT License

## Support

For issues and feature requests, please use GitHub Issues.
