# ScamDunk Admin Workspace

A standalone admin dashboard for managing the ScamDunk application, completely separate from the main app authentication and functionality.

## Features

### 1. Dashboard (Usage Metrics)
- Total and active users statistics
- Monthly and daily scan counts
- Risk distribution visualization
- User plan breakdown (Free vs Paid)
- New user acquisition tracking
- Average processing time metrics

### 2. API Usage & Costs Monitoring
- Real-time API request tracking
- Cost estimation per service (OpenAI, Alpha Vantage, Stripe)
- Customizable cost alerts with thresholds
- Error rate monitoring
- Hourly/daily/monthly usage breakdowns

### 3. Integrations Management
- Connection status for all integrations
- One-click integration testing
- Configuration options (rate limits, budgets)
- Health summary dashboard
- Direct links to documentation

### 4. Model Efficacy
- Scan accuracy tracking
- False positive/negative reporting
- Risk level distribution analysis
- Top scanned tickers
- Processing time trends
- Manual feedback system for model improvement

### 5. Team Management
- Invite new admin users
- Role-based access control (OWNER, ADMIN, VIEWER)
- User activation/deactivation
- Audit logging

## Access Control

### Roles
- **OWNER**: Full access including team management, audit logs
- **ADMIN**: Full access except team management
- **VIEWER**: Read-only access to dashboards

### Initial Setup

The first admin user (OWNER) must be created before the admin panel can be used.

#### Option 1: Using the Seed Script
```bash
npm run db:seed:admin
```

This creates the default owner:
- Email: elimizroch@gmail.com
- Password: Elim2232!

#### Option 2: Using the Setup API
```bash
curl -X POST http://localhost:3000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "elimizroch@gmail.com",
    "password": "Elim2232!",
    "name": "Admin Owner"
  }'
```

## Routes

### Admin UI Routes
- `/admin` - Redirects to login
- `/admin/login` - Login page (also handles invite acceptance)
- `/admin/dashboard` - Main metrics dashboard
- `/admin/api-usage` - API usage and cost monitoring
- `/admin/integrations` - Integration management
- `/admin/model-efficacy` - Model performance tracking
- `/admin/team` - Team and invite management

### Admin API Routes
- `POST /api/admin/auth/login` - Login
- `POST /api/admin/auth/logout` - Logout
- `GET /api/admin/auth/session` - Get current session
- `GET /api/admin/setup` - Check if setup is required
- `POST /api/admin/setup` - Create initial owner
- `GET /api/admin/dashboard` - Dashboard metrics
- `GET /api/admin/api-usage` - API usage summary
- `GET/POST/DELETE /api/admin/api-usage/alerts` - Alert management
- `GET/PATCH /api/admin/integrations` - Integration management
- `POST /api/admin/integrations/test` - Test integrations
- `GET /api/admin/model-efficacy` - Model metrics
- `POST /api/admin/model-efficacy/feedback` - Submit feedback
- `GET /api/admin/model-efficacy/scans` - Recent scans
- `GET/PATCH /api/admin/team` - Team management
- `POST/PUT /api/admin/team/invite` - Invitations
- `GET /api/admin/audit` - Audit logs (OWNER only)

## Database Models

### AdminUser
Stores admin user accounts with:
- Email/password authentication
- Role assignment
- Activity tracking

### AdminSession
Cookie-based session management with:
- Token-based authentication
- Automatic expiration (7 days)
- IP/User-Agent logging

### AdminInvite
Invitation system with:
- Unique invite tokens
- Role pre-assignment
- 7-day expiration

### ApiUsageLog
API call tracking with:
- Service identification
- Token usage (for OpenAI)
- Cost estimation
- Response times

### ApiCostAlert
Configurable alerts with:
- Service-specific or global
- Cost, rate limit, or error thresholds
- Trigger history

### IntegrationConfig
Integration management with:
- Connection status
- Rate limits
- Monthly budgets

### ScanHistory
Detailed scan logging with:
- All scan parameters
- Results and processing time
- User attribution

### ModelMetrics
Daily aggregated metrics for:
- Risk distribution
- Accuracy tracking
- Performance monitoring

### AdminAuditLog
Complete audit trail of:
- All admin actions
- Configuration changes
- Security events

## Security Considerations

1. **Separate Authentication**: Admin auth is completely separate from main app auth
2. **Session-Based**: Uses secure httpOnly cookies
3. **Role-Based Access**: Granular permissions per role
4. **Audit Logging**: All admin actions are logged
5. **Password Hashing**: bcrypt with salt rounds
6. **CSRF Protection**: SameSite cookie attribute

## Environment Variables

The admin workspace uses existing environment variables:
- `DATABASE_URL` - PostgreSQL connection
- `NEXTAUTH_URL` - Base URL for invite links
- `ADMIN_SETUP_KEY` (optional) - Additional security for initial setup

## Inviting New Team Members

1. Login as OWNER
2. Go to Team page
3. Click "Invite User"
4. Enter email and select role
5. Copy and share the invite link
6. Invitee accepts and creates password
7. Invitee can now login

## Monitoring API Costs

### Setting Up Alerts
1. Go to API Usage page
2. Click "Add Alert"
3. Choose service, type, and threshold
4. Alert will trigger when threshold exceeded

### Cost Estimates
OpenAI costs are estimated at:
- Input tokens: $0.00015/1K tokens
- Output tokens: $0.0006/1K tokens

Alpha Vantage and other APIs use request-based estimates.

## Model Improvement Workflow

1. Go to Model Efficacy page
2. Review recent scans
3. For incorrect predictions, click feedback buttons:
   - Green checkmark: Correct prediction
   - Yellow warning: False positive (flagged safe stock)
   - Red X: False negative (missed scam)
4. Feedback updates accuracy metrics
5. Use insights to improve scoring algorithms

## Troubleshooting

### Cannot Login
- Verify admin user exists in database
- Check password is correct
- Clear browser cookies and retry

### Integration Shows "Error"
- Click "Test" to get detailed error
- Verify API keys in environment variables
- Check API service status

### Metrics Not Updating
- Ensure scans are being logged (check ScanHistory table)
- Verify ModelMetrics table has entries
- Check for database connection errors

## Development

### Adding New Metrics
1. Add fields to relevant Prisma model
2. Update the metrics collection functions in `/lib/admin/metrics.ts`
3. Add UI components in dashboard pages

### Adding New Integrations
1. Add integration definition in `/lib/admin/integrations.ts`
2. Implement test function
3. Add to DEFAULT_INTEGRATIONS in seed script

### Extending Roles
1. Update role checks in `/lib/admin/auth.ts`
2. Add new role to AdminUser model if needed
3. Update UI permissions in components
