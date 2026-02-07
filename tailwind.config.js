/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    fontFamily: {
      sans: ['var(--font-sans)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      display: ['var(--font-display)', 'Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        risk: {
          low: "#00D68F",
          medium: "#FFB020",
          high: "#FF4757",
          insufficient: "#6B7280",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'glow-sm': '0 0 12px -3px hsl(var(--primary) / 0.15)',
        'glow': '0 0 24px -4px hsl(var(--primary) / 0.2)',
        'glow-lg': '0 0 40px -4px hsl(var(--primary) / 0.25)',
        'card': '0 1px 2px 0 rgb(0 0 0 / 0.03), 0 4px 16px -4px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.06), 0 12px 32px -8px rgb(0 0 0 / 0.08)',
        'elevated': '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03), 0 8px 32px -8px rgb(0 0 0 / 0.06)',
      },
      fontSize: {
        'hero': ['3.25rem', { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '700' }],
        'hero-sm': ['2.25rem', { lineHeight: '1.12', letterSpacing: '-0.025em', fontWeight: '700' }],
        'title': ['1.5rem', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '-0.015em' }],
        'subtitle': ['1.125rem', { lineHeight: '1.55', fontWeight: '400' }],
      },
      keyframes: {
        'enter': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'enter-scale': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'enter': 'enter 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'enter-scale': 'enter-scale 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
}
