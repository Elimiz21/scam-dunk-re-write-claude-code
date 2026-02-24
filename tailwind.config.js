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
      sans: ['var(--font-sans)', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      display: ['var(--font-display)', 'Playfair Display', 'Georgia', 'serif'],
      mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
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
          low: "#10b981",
          medium: "#f59e0b",
          high: "#ef4444",
          insufficient: "#6b7280",
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
        'glow-sm': '0 0 12px -3px hsl(var(--primary) / 0.2)',
        'glow': '0 0 24px -4px hsl(var(--primary) / 0.25)',
        'glow-lg': '0 0 40px -4px hsl(var(--primary) / 0.3)',
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.03), 0 6px 24px -4px rgb(0 0 0 / 0.05)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.06), 0 16px 40px -8px rgb(0 0 0 / 0.08)',
        'elevated': '0 0 0 1px rgb(0 0 0 / 0.03), 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 32px -8px rgb(0 0 0 / 0.08)',
      },
      fontSize: {
        'hero': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'hero-sm': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'title': ['1.5rem', { lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }],
        'subtitle': ['1.125rem', { lineHeight: '1.5' }],
      },
      keyframes: {
        'enter': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'enter-scale': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'enter': 'enter 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'enter-scale': 'enter-scale 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
