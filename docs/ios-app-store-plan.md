# Scam Dunk iOS App Store Plan

## Executive Summary

This document outlines the comprehensive plan to bring Scam Dunk to the iOS App Store. The plan covers technology selection, development phases, App Store requirements, and timeline considerations.

---

## 1. Technology Approach Options

### Option A: React Native (Recommended)

**Pros:**
- Shared codebase with future Android app
- Reuse existing React/TypeScript knowledge and some components
- Large ecosystem and community support
- Good performance for this type of app
- Expo framework simplifies development and deployment

**Cons:**
- Some native modules may need bridging
- Slightly larger app size than pure native

**Estimated Development Time:** 6-8 weeks for MVP

### Option B: Native Swift/SwiftUI

**Pros:**
- Best performance and native feel
- Full access to iOS features
- Smaller app size
- Latest Apple technologies (SwiftUI)

**Cons:**
- No code sharing with Android
- Requires Swift expertise
- Longer development time

**Estimated Development Time:** 10-12 weeks for MVP

### Option C: Flutter

**Pros:**
- Cross-platform (iOS + Android)
- Fast development with hot reload
- Beautiful UI components

**Cons:**
- Dart learning curve
- No reuse of existing TypeScript code
- Larger app size

**Estimated Development Time:** 6-8 weeks for MVP

### Option D: Progressive Web App (PWA) Wrapper (Capacitor/Ionic)

**Pros:**
- Maximum code reuse from existing Next.js app
- Fastest time to market
- Single codebase for web and mobile

**Cons:**
- Limited native functionality
- May face App Store rejection for being "web wrapper"
- Potentially inferior user experience

**Estimated Development Time:** 3-4 weeks

---

## 2. Recommended Approach: React Native with Expo

Given Scam Dunk's requirements, **React Native with Expo** is recommended because:

1. **Code Reuse:** Can share TypeScript types, API client logic, and some UI patterns
2. **Cross-Platform:** Same codebase works for Android (Phase 2)
3. **Mature Ecosystem:** Well-supported libraries for auth, payments, and networking
4. **App Store Compliant:** Generates a true native app that meets Apple's guidelines
5. **Team Skills:** Leverages existing React/TypeScript expertise

---

## 3. App Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     iOS App (React Native)                   │
├─────────────────────────────────────────────────────────────┤
│  Screens                                                     │
│  ├── Auth (Login, Signup, Forgot Password)                  │
│  ├── Home (Stock Check Input)                               │
│  ├── Results (Risk Analysis Display)                        │
│  ├── History (Past Scans)                                   │
│  ├── Account (Profile, Plan, Settings)                      │
│  └── Upgrade (Subscription Management)                      │
├─────────────────────────────────────────────────────────────┤
│  Components                                                  │
│  ├── RiskCard (Adapted from web)                            │
│  ├── ScanInput (Native keyboard optimized)                  │
│  ├── LoadingStepper (Animated progress)                     │
│  ├── SignalBadge (Risk indicator)                           │
│  └── Navigation (Tab + Stack)                               │
├─────────────────────────────────────────────────────────────┤
│  Services                                                    │
│  ├── API Client (Axios/fetch to existing backend)           │
│  ├── Auth Service (JWT token management)                    │
│  ├── Storage (SecureStore for credentials)                  │
│  └── In-App Purchase (StoreKit via expo-in-app-purchases)   │
├─────────────────────────────────────────────────────────────┤
│  Native Modules                                              │
│  ├── Biometric Auth (Face ID/Touch ID)                      │
│  ├── Push Notifications (APNs)                              │
│  ├── Haptic Feedback                                        │
│  └── Share Extension                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Existing Backend (No Changes Needed)            │
│  ├── Next.js API Routes (/api/check, /api/auth, etc.)       │
│  ├── PostgreSQL Database (Supabase)                         │
│  ├── Python AI Backend (Optional ML features)               │
│  └── External APIs (Alpha Vantage, OpenAI, SEC)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Development Phases

### Phase 1: Project Setup & Infrastructure (Week 1)

- [ ] Initialize React Native project with Expo
- [ ] Set up TypeScript configuration
- [ ] Configure navigation (React Navigation)
- [ ] Set up state management (Zustand or React Query)
- [ ] Create API client with authentication handling
- [ ] Configure environment variables for dev/staging/prod
- [ ] Set up ESLint, Prettier, and testing framework

**Deliverables:**
- Runnable app skeleton
- Navigation structure
- API client connected to backend

### Phase 2: Authentication Flow (Week 2)

- [ ] Login screen with email/password
- [ ] Signup screen with validation
- [ ] Forgot password flow
- [ ] JWT token storage (SecureStore)
- [ ] Auto-login on app launch
- [ ] Logout functionality
- [ ] Session expiry handling
- [ ] Face ID/Touch ID integration (optional)

**Deliverables:**
- Complete authentication flow
- Secure credential storage
- Biometric login option

### Phase 3: Core Stock Check Feature (Weeks 3-4)

- [ ] Stock ticker input with autocomplete
- [ ] Optional pitch text input
- [ ] Submit and loading states
- [ ] Results display (RiskCard adaptation)
  - [ ] Risk level indicator (LOW/MEDIUM/HIGH)
  - [ ] Signal categories display
  - [ ] Individual signal details
  - [ ] AI narrative display
- [ ] Error handling (invalid ticker, API errors)
- [ ] Usage limit tracking and display
- [ ] Limit reached screen with upgrade CTA

**Deliverables:**
- Full stock analysis flow
- Native-optimized UI for results
- Usage tracking integration

### Phase 4: History & Account (Week 5)

- [ ] Scan history list view
- [ ] History detail view (past results)
- [ ] Account/Profile screen
  - [ ] User info display
  - [ ] Current plan display
  - [ ] Usage statistics
- [ ] Settings screen
  - [ ] Notification preferences
  - [ ] App theme (dark/light)
  - [ ] About/Legal links

**Deliverables:**
- Complete history feature
- Account management screens

### Phase 5: In-App Purchases (Week 6)

- [ ] Set up App Store Connect products
- [ ] Integrate expo-in-app-purchases or react-native-iap
- [ ] Upgrade screen UI
- [ ] Purchase flow implementation
- [ ] Receipt validation (server-side)
- [ ] Restore purchases functionality
- [ ] Handle subscription status changes
- [ ] Update backend billing integration

**Important Note:** Apple takes 30% (15% for small businesses) of in-app purchases. This affects pricing strategy.

**Deliverables:**
- Working subscription purchase flow
- Receipt validation
- Plan upgrade functionality

### Phase 6: Polish & Native Features (Week 7)

- [ ] Push notifications setup
  - [ ] Notification permissions
  - [ ] APNs configuration
  - [ ] Welcome/onboarding notifications
  - [ ] Usage limit warnings
- [ ] Haptic feedback on interactions
- [ ] Share functionality (share results)
- [ ] App icon and splash screen
- [ ] Loading animations
- [ ] Error states and empty states
- [ ] Accessibility improvements (VoiceOver)
- [ ] Performance optimization

**Deliverables:**
- Polished, production-ready app
- Native iOS features integrated

### Phase 7: Testing & QA (Week 8)

- [ ] Unit tests for business logic
- [ ] Integration tests for API calls
- [ ] E2E tests with Detox
- [ ] Manual testing on multiple devices
  - [ ] iPhone SE (small screen)
  - [ ] iPhone 14/15 (standard)
  - [ ] iPhone Pro Max (large screen)
- [ ] TestFlight beta distribution
- [ ] Beta tester feedback collection
- [ ] Bug fixes and refinements

**Deliverables:**
- Tested, stable application
- TestFlight build for beta testers

---

## 5. App Store Requirements

### 5.1 Apple Developer Program

- [ ] Enroll in Apple Developer Program ($99/year)
- [ ] Set up App Store Connect account
- [ ] Configure app identifier (bundle ID)
- [ ] Generate distribution certificates and provisioning profiles

### 5.2 App Store Connect Setup

- [ ] Create app listing
- [ ] Set up app pricing (free with IAP)
- [ ] Configure in-app purchases
- [ ] Set up TestFlight for beta testing

### 5.3 Required Assets

| Asset | Specification |
|-------|---------------|
| App Icon | 1024x1024px (no transparency, no rounded corners) |
| Screenshots | 6.7" (1290x2796), 6.5" (1284x2778), 5.5" (1242x2208) |
| iPad Screenshots | 12.9" (2048x2732) - if supporting iPad |
| App Preview Video | Optional, up to 30 seconds |
| Promotional Text | 170 characters max |
| Description | 4000 characters max |
| Keywords | 100 characters max |
| Support URL | Required (https://scamdunk.com/help) |
| Privacy Policy URL | Required (https://scamdunk.com/privacy) |
| Marketing URL | Optional (https://scamdunk.com) |

### 5.4 App Store Guidelines Compliance

**Content & Functionality:**
- [ ] App provides genuine value beyond a website
- [ ] All features work as described
- [ ] No placeholder content
- [ ] No hidden features

**Finance Category Specific:**
- [ ] Clear disclaimers that this is not financial advice
- [ ] Accurate representation of what the app does
- [ ] No guarantees of investment returns
- [ ] Compliance with financial regulations

**Privacy:**
- [ ] Privacy policy clearly explains data collection
- [ ] App Privacy "nutrition labels" configured
- [ ] User consent for tracking (ATT framework)
- [ ] GDPR/CCPA compliance

**In-App Purchases:**
- [ ] Clear pricing before purchase
- [ ] Restore purchases functionality
- [ ] No external payment links for digital goods

### 5.5 App Review Preparation

**Demo Account:**
- Create a demo account for Apple reviewers
- Pre-populate with sample data
- Document in App Review notes

**Review Notes:**
- Explain the app's purpose clearly
- Provide test credentials
- Explain any special configurations needed
- Describe the subscription model

---

## 6. App Store Listing Content

### App Name
**Scam Dunk - Stock Scam Detector**

### Subtitle
**Protect Your Investments**

### Description (Draft)
```
Scam Dunk helps retail investors identify potential red flags in stock pitches before making investment decisions.

KEY FEATURES:

📊 REAL-TIME STOCK ANALYSIS
Enter any stock ticker to instantly analyze structural risks including penny stock indicators, low liquidity warnings, and OTC exchange flags.

🔍 PUMP-AND-DUMP DETECTION
Our advanced algorithms detect suspicious price patterns, unusual volume spikes, and classic pump-and-dump schemes.

💬 PITCH TEXT ANALYSIS
Paste in that "hot stock tip" you received. Our behavioral analysis flags common scam language like guaranteed returns, urgency tactics, and insider claims.

🤖 AI-POWERED INSIGHTS
Get clear, plain-English explanations of every risk signal detected, powered by advanced AI.

📈 SCAN HISTORY
Track all your previous scans and revisit analysis results anytime.

SUBSCRIPTION PLANS:
• Free: 5 stock checks per month
• Pro: 200 stock checks per month

DISCLAIMER:
Scam Dunk is an educational tool and does not provide financial advice. Always conduct your own research and consult qualified professionals before making investment decisions.
```

### Keywords
`stock scam,investment fraud,pump dump,penny stocks,stock alerts,trading safety,investment checker`

### Category
Primary: **Finance**
Secondary: **Education**

### Age Rating
**12+** (Infrequent/Mild Mature/Suggestive Themes - financial content)

---

## 7. Pricing Strategy

### Current Web Pricing
- FREE: 5 checks/month
- PAID: 200 checks/month (price TBD)

### iOS Pricing Considerations

**Apple's Commission:**
- 30% on all in-app purchases (15% if < $1M annual revenue)

**Recommended iOS Pricing:**
| Tier | Monthly | Annual | Notes |
|------|---------|--------|-------|
| Free | $0 | $0 | 5 checks/month |
| Pro | $4.99 | $39.99 | 200 checks/month |

**Revenue Per Subscription (after Apple's cut):**
- Monthly: $3.49 (70% of $4.99)
- Annual: $27.99 (70% of $39.99)

---

## 8. Technical Requirements

### Minimum iOS Version
**iOS 15.0** (covers 95%+ of active devices)

### Device Support
- iPhone (required)
- iPad (optional, recommend adding for broader reach)

### Required Capabilities
- Network access
- Push notifications (optional)
- Face ID/Touch ID (optional)

### Backend Changes Required

1. **API Authentication Updates:**
   - Support mobile-friendly token refresh
   - Add device registration for push notifications

2. **In-App Purchase Validation:**
   - Add endpoint: `POST /api/billing/apple/validate`
   - Verify App Store receipts server-side
   - Update user plan based on subscription status

3. **Push Notification Service:**
   - Integrate with APNs (Apple Push Notification service)
   - Add endpoint for device token registration

---

## 9. Project Structure (React Native)

```
scam-dunk-mobile/
├── app/                          # Expo Router screens
│   ├── (auth)/                   # Auth group
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/                   # Main tab navigation
│   │   ├── index.tsx             # Home/Check screen
│   │   ├── history.tsx           # Scan history
│   │   └── account.tsx           # Account/Settings
│   ├── results/[id].tsx          # Results screen
│   ├── upgrade.tsx               # Subscription screen
│   └── _layout.tsx               # Root layout
├── components/
│   ├── RiskCard.tsx
│   ├── ScanInput.tsx
│   ├── SignalBadge.tsx
│   ├── LoadingSpinner.tsx
│   └── ui/                       # Base UI components
├── services/
│   ├── api.ts                    # API client
│   ├── auth.ts                   # Authentication
│   ├── storage.ts                # Secure storage
│   └── purchases.ts              # In-app purchases
├── hooks/
│   ├── useAuth.ts
│   ├── useStockCheck.ts
│   └── useSubscription.ts
├── types/
│   └── index.ts                  # Shared TypeScript types
├── constants/
│   ├── colors.ts
│   └── config.ts
├── assets/
│   ├── icon.png
│   ├── splash.png
│   └── images/
├── app.json                      # Expo config
├── package.json
├── tsconfig.json
└── eas.json                      # EAS Build config
```

---

## 10. Dependencies (React Native/Expo)

```json
{
  "dependencies": {
    "expo": "~50.0.0",
    "expo-router": "~3.4.0",
    "expo-secure-store": "~12.8.0",
    "expo-local-authentication": "~13.8.0",
    "expo-notifications": "~0.27.0",
    "expo-haptics": "~12.8.0",
    "expo-sharing": "~11.10.0",
    "react-native-iap": "^12.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.5.0",
    "axios": "^1.6.0",
    "react-native-reanimated": "~3.6.0",
    "react-native-gesture-handler": "~2.14.0",
    "@react-navigation/native": "^6.1.0"
  }
}
```

---

## 11. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| App Store rejection | High | Follow guidelines strictly, prepare demo account |
| In-app purchase issues | High | Thorough testing, use established libraries |
| API rate limiting | Medium | Implement proper caching, retry logic |
| Performance issues | Medium | Profile early, optimize images/animations |
| Security vulnerabilities | High | Security audit, use SecureStore, certificate pinning |
| User adoption | Medium | Focus on onboarding, A/B test store listing |

---

## 12. Success Metrics

### Launch Goals (First 90 Days)
- 1,000+ downloads
- 4.0+ App Store rating
- 5% free-to-paid conversion rate
- <1% crash rate

### Key Performance Indicators
- Daily Active Users (DAU)
- Scans per user per session
- Subscription conversion rate
- User retention (Day 1, Day 7, Day 30)
- App Store rating and reviews

---

## 13. Post-Launch Roadmap

### Version 1.1
- Widget for quick stock checks
- Watch App (Apple Watch)
- Siri Shortcuts integration

### Version 1.2
- Social features (share results)
- Watchlist functionality
- Price alerts

### Version 2.0
- Android release
- Premium tier with advanced features

---

## 14. Action Items Summary

### Immediate (This Week)
1. [ ] Decide on technology approach (React Native recommended)
2. [ ] Enroll in Apple Developer Program
3. [ ] Initialize mobile project repository
4. [ ] Set up development environment

### Short-term (Weeks 1-4)
5. [ ] Complete Phase 1-3 development
6. [ ] Create App Store Connect listing
7. [ ] Design app icon and screenshots

### Medium-term (Weeks 5-8)
8. [ ] Complete Phase 4-7 development
9. [ ] TestFlight beta testing
10. [ ] Submit for App Store review

### Post-Launch
11. [ ] Monitor analytics and reviews
12. [ ] Iterate based on feedback
13. [ ] Plan Android version

---

## Appendix A: Legal Requirements

### Required Legal Documents
1. **Privacy Policy** - Already exists at `/privacy`
2. **Terms of Service** - Already exists at `/terms`
3. **Disclaimer** - Already exists at `/disclaimer`

### App Store Privacy Labels
Data collected (to be disclosed):
- Email address (account creation)
- Usage data (scans performed)
- Identifiers (user ID for analytics)
- Purchase history (subscriptions)

---

## Appendix B: Backend API Endpoints for Mobile

### Base URL
`https://scamdunk.com`

### Existing Endpoints (No Changes Needed)
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/check` - Stock analysis
- `GET /api/user` - Get user info
- `GET /api/user/usage` - Get usage stats

### New Endpoints Required
- `POST /api/billing/apple/validate` - Validate Apple receipt
- `POST /api/notifications/register` - Register device for push
- `GET /api/user/history` - Get scan history (may need pagination)

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Author: Claude (AI Assistant)*
