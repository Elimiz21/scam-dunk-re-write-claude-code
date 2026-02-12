import Link from "next/link";
import { Shield, Home, Search, HelpCircle, ArrowRight, Eye } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background gradient-mesh px-4">
      <div className="max-w-md w-full text-center animate-fade-in">
        {/* Brand Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/25">
              <Shield className="h-8 w-8 text-white" strokeWidth={2} />
            </div>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
              <Eye className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
        </div>

        {/* Error Message */}
        <h1 className="font-display text-6xl font-bold mb-2 gradient-brand-text italic">
          404
        </h1>
        <h2 className="font-display text-xl font-semibold mb-3 italic">
          Page Not Found
        </h2>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on track.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full gradient-brand text-white font-semibold hover:opacity-90 transition-all duration-200 shadow-glow-sm"
          >
            <Home className="h-4 w-4" />
            Scan a Stock
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-all duration-200"
          >
            <HelpCircle className="h-4 w-4" />
            Help & FAQ
          </Link>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/about" className="p-3 rounded-xl card-interactive group text-left">
            <h3 className="font-medium text-sm mb-0.5 group-hover:text-primary transition-colors">About</h3>
            <p className="text-xs text-muted-foreground">Learn about ScamDunk</p>
          </Link>
          <Link href="/how-it-works" className="p-3 rounded-xl card-interactive group text-left">
            <h3 className="font-medium text-sm mb-0.5 group-hover:text-primary transition-colors">How It Works</h3>
            <p className="text-xs text-muted-foreground">Our methodology</p>
          </Link>
          <Link href="/contact" className="p-3 rounded-xl card-interactive group text-left">
            <h3 className="font-medium text-sm mb-0.5 group-hover:text-primary transition-colors">Contact</h3>
            <p className="text-xs text-muted-foreground">Get in touch</p>
          </Link>
          <Link href="/news" className="p-3 rounded-xl card-interactive group text-left">
            <h3 className="font-medium text-sm mb-0.5 group-hover:text-primary transition-colors">News</h3>
            <p className="text-xs text-muted-foreground">Latest updates</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
