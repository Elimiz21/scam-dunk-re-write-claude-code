# ScamDunk UX/UI Evaluation Report

**Website:** https://scamdunk.com/
**Date:** February 2026
**Evaluator:** Senior UX/UI Consultant

---

## Executive Summary

**Overall UX/UI Score: 7.2 / 10**

ScamDunk is a well-designed stock scam detection tool built on Next.js 14 with a polished design system featuring warm coral/teal brand gradients, Playfair Display + DM Sans typography pairing, and thoughtful dark/light theme support. The core scan experience (input, loading stepper, risk card) is genuinely impressive and competitive with top-tier SaaS products.

**Top 3 Critical Issues:**
1. **Missing Footer on all pages** -- The Footer component exists but is never rendered on any page, removing site-wide navigation, legal links, and the important educational disclaimer
2. **Navigation lacks active state indicators** -- Users cannot tell which page they are currently on in the sidebar or header
3. **Accessibility gaps** -- Missing skip-to-content link, FAQ accordion lacks ARIA attributes, and several text opacity values fall below WCAG AA contrast ratios

**Key Opportunities:**
- Adding the footer across all pages immediately improves trust, legal compliance, and navigation
- Active navigation states and breadcrumbs will reduce user disorientation
- Accessibility fixes bring the site closer to WCAG 2.1 AA compliance
- These changes are expected to improve user engagement, reduce bounce rate on inner pages, and strengthen trust signals for a product that fundamentally depends on user trust

---

## Critical Issues (High Priority)

### Issue 1: Footer Component Never Rendered

- **Current State**: A well-designed `Footer` component exists at `src/components/Footer.tsx` with brand info, product links, legal links, contact info, a disclaimer banner, and copyright. However, it is not rendered on ANY page in the application -- not the homepage, not content pages, not auth pages.
- **User Impact**: HIGH -- Users cannot navigate between sections from the bottom of long pages. Legal links (Terms, Privacy, Disclaimer) are only accessible via the sidebar (which requires clicking a hamburger icon). The important "not financial advice" disclaimer is invisible. This damages trust for a financial tool.
- **Evidence**: Searched all page files -- no `<Footer />` import or usage found. The component at `src/components/Footer.tsx:6` is orphaned.
- **Recommendation**: Add `<Footer />` to all public-facing pages. At minimum, add it to the root layout or to every page template. The landing page (`LandingOptionA`), content pages (about, how-it-works, help, contact, news), and legal pages should all include it.

### Issue 2: No Active State in Navigation

- **Current State**: The sidebar navigation (`src/components/Sidebar.tsx:241-271`) renders links to About, News, How It Works, Help & FAQ, Contact, plus legal pages. None of these links show an active/current state. The header similarly has no indication of current page.
- **User Impact**: HIGH -- Users lose their sense of place within the site. On a site with 8+ content pages, this creates disorientation and increases cognitive load.
- **Evidence**: The sidebar link buttons at `Sidebar.tsx:249` all use identical classes with no conditional styling based on `pathname`. No `usePathname()` hook is used.
- **Recommendation**: Use Next.js `usePathname()` to conditionally apply active styles (e.g., `bg-primary/10 text-primary font-semibold`) to the current page's navigation link in both the sidebar and header.

### Issue 3: Accessibility -- Missing Skip-to-Content Link

- **Current State**: The site has no skip-to-content link. Screen reader and keyboard users must tab through the entire header and sidebar navigation on every page load before reaching main content.
- **User Impact**: HIGH -- This is a WCAG 2.1 Level A failure (Success Criterion 2.4.1). It disproportionately affects users who rely on keyboard navigation.
- **Evidence**: `src/app/layout.tsx` does not contain any skip link. No `#main-content` anchor exists.
- **Recommendation**: Add a visually hidden skip link as the first focusable element in the layout that becomes visible on focus, linking to `<main id="main-content">`.

---

## Moderate Issues (Medium Priority)

### Issue 4: FAQ Accordion Lacks ARIA Attributes

- **Current State**: The FAQ section on the Help page (`src/app/help/page.tsx:213-248`) uses custom buttons for expand/collapse but lacks proper ARIA attributes for accordion behavior.
- **User Impact**: MEDIUM -- Screen readers cannot announce whether FAQ items are expanded or collapsed, nor can they associate questions with their answers.
- **Evidence**: FAQ buttons at `help/page.tsx:219` have no `aria-expanded`, `aria-controls`, or `role` attributes. Answer regions have no `role="region"` or `aria-labelledby`.
- **Recommendation**: Add `aria-expanded={openFAQ === index}`, `aria-controls={`faq-answer-${index}`}`, and `id={`faq-question-${index}`}` to each question button. Add `id={`faq-answer-${index}`}`, `role="region"`, and `aria-labelledby={`faq-question-${index}`}` to each answer panel.

### Issue 5: Sidebar Scan History Items Non-Functional

- **Current State**: Recent scan items in the sidebar (`Sidebar.tsx:208-230`) have click handlers that only call `onToggle()` (close sidebar) but don't navigate to the scan result or reload it.
- **User Impact**: MEDIUM -- Users see their scan history but clicking an entry only closes the sidebar without showing that scan's results. This creates a broken interaction pattern.
- **Evidence**: `Sidebar.tsx:212` -- `onClick={() => { onToggle(); }}` -- no navigation or state restoration.
- **Recommendation**: Either navigate to a scan detail page (e.g., `/scan/{id}`) or pass the scan data back to the homepage to re-display the result.

### Issue 6: Landing Page CTA Creates False Start

- **Current State**: The landing page for non-logged-in users (`LandingOptionA.tsx`) prominently displays the ScanInput component. Users can type a ticker and click submit, but `page.tsx:111-114` immediately redirects to `/login` if no session exists.
- **User Impact**: MEDIUM -- Users experience a "bait and switch" where they invest effort into filling out the form only to be redirected. This creates frustration and may increase bounce rate.
- **Evidence**: `page.tsx:111` -- `if (!session) { window.location.href = "/login?callbackUrl=/"; return; }`
- **Recommendation**: Either (a) show a clear "Sign up to scan" overlay on the ScanInput for non-authenticated users, or (b) allow one free scan without authentication to demonstrate value before requiring signup.

### Issue 7: Low Text Contrast in Several Areas

- **Current State**: Multiple components use opacity modifiers like `text-muted-foreground/50` and `text-muted-foreground/60` which can fall below the WCAG AA minimum contrast ratio of 4.5:1.
- **User Impact**: MEDIUM -- Reduced readability for users with low vision or in bright environments.
- **Evidence**: `Sidebar.tsx:186` uses `text-muted-foreground/70`, `Sidebar.tsx:225` uses `text-muted-foreground/60`, LoadingStepper uses `text-muted-foreground/50` for pending steps, and `RiskCard.tsx:338` uses `text-muted-foreground/70`.
- **Recommendation**: Ensure all text meets minimum 4.5:1 contrast ratio. Replace `/50` and `/60` opacity values with at minimum `/70` for small text and `/80` for body text.

---

## Enhancement Opportunities (Low Priority)

### Issue 8: No Custom 404 Page

- **Current State**: No `not-found.tsx` exists in the app directory. Broken links show the default Next.js 404 page which doesn't match the brand.
- **User Impact**: LOW -- Infrequent but jarring when encountered. Breaks the brand experience and provides no navigation back to useful content.
- **Recommendation**: Create a branded `src/app/not-found.tsx` with the ScamDunk design system, helpful links, and a search/scan CTA.

### Issue 9: No Breadcrumb Navigation

- **Current State**: Content pages (About, How It Works, Help, Contact, News) lack breadcrumb navigation.
- **User Impact**: LOW -- Users on deep pages have no visual hierarchy indicator. The sidebar provides navigation, but breadcrumbs offer at-a-glance orientation without opening the sidebar.
- **Recommendation**: Add a simple breadcrumb component below the header on content pages (e.g., "Home > About").

### Issue 10: Duplicate "About" Links in Header

- **Current State**: The header (`Header.tsx:90-99`) has a standalone About icon button AND the user dropdown menu (`Header.tsx:171-179`) also has an "About" link.
- **User Impact**: LOW -- Minor redundancy that adds clutter to the header.
- **Recommendation**: Remove the standalone About icon from the header since it's accessible in both the user menu and sidebar.

### Issue 11: Hero Section Pattern Repetition

- **Current State**: Every content page (About, How It Works, Help, Contact) uses an identical hero section layout: gradient-mesh background, 16x16 gradient icon with eye badge, italic Playfair Display heading, muted foreground description.
- **User Impact**: LOW -- While consistent, the repetition makes pages feel templated. The small eye icon badge repeated on every hero feels mechanical.
- **Recommendation**: Vary the hero layouts slightly per page type. Consider removing the eye badge from inner page heroes (reserve it for the main brand logo) and varying background treatments.

---

## Visual Improvements & Recommendations

### Before/After: Footer Integration

**Before:** Pages end abruptly after content. No footer navigation, no disclaimer, no legal links visible without opening sidebar.

**After (Recommended):** Every page renders the existing `Footer` component with:
- Brand section with tagline
- Product links (Stock Scanner, How It Works, About Us)
- Legal links (Terms, Privacy, Disclaimer)
- Contact section
- Red disclaimer banner ("ScamDunk is an educational tool...")
- Copyright bar

### Before/After: Active Navigation State

**Before:** All sidebar navigation items appear identical regardless of current page.

**After (Recommended):** Current page link receives `bg-primary/10 text-primary font-medium` styling with a left border accent, clearly indicating the user's current location.

### Before/After: Skip-to-Content

**Before:** No skip link. Keyboard users must tab through ~15+ focusable elements before reaching content.

**After (Recommended):** A visually-hidden-until-focused link as the first element: "Skip to main content" that jumps focus to the `<main>` element.

### Before/After: 404 Page

**Before:** Default unstyled Next.js 404 page.

**After (Recommended):** Branded page with ScamDunk logo, friendly message, search CTA, and navigation links.

---

## Brand Consistency Assessment

### Strengths
- **Color Palette**: Excellent warm coral-to-teal gradient system used consistently across all pages. The HSL variable approach enables seamless light/dark theme switching.
- **Typography**: Playfair Display (serif) for headlines + DM Sans (sans-serif) for body creates a distinctive, trustworthy feel appropriate for a financial tool.
- **Iconography**: Consistent use of Lucide React icons with appropriate sizing and spacing. The Shield + Eye brand mark is distinctive.
- **Component Design**: Cards, buttons, and interactive elements follow a consistent design language with rounded-xl corners, subtle shadows, and spring-curve animations.
- **Dark Mode**: Well-implemented with appropriate color shifts that maintain readability and brand identity.

### Areas for Improvement
- **Footer Absence**: The single biggest brand consistency issue. The footer is designed but invisible.
- **Navigation Consistency**: Some pages render a sidebar that does nothing useful (e.g., `onNewScan={() => {}}` on content pages).
- **Trust Indicators**: The landing page has trust badges ("Free to use", "No credit card", "Results in seconds") but inner pages lack any social proof or trust signals.

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Highest Impact)
1. Add Footer component to all pages
2. Implement active navigation states in sidebar
3. Add skip-to-content accessibility link
4. Fix FAQ accordion ARIA attributes

### Phase 2: Medium Priority Improvements
5. Create custom 404 page
6. Fix text contrast issues (opacity values)
7. Improve landing page CTA flow for non-authenticated users
8. Make sidebar scan history items functional

### Phase 3: Enhancements
9. Add breadcrumb navigation to content pages
10. Remove duplicate About link from header
11. Vary hero section designs across pages
12. Add testimonials/social proof to inner pages
