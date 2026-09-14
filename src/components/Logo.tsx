import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Rendered height in pixels. */
  size?: number;
  href?: string | null;
  className?: string;
  priority?: boolean;
  onDarkSurface?: boolean;
}

/**
 * The ScamDunk shield-S and wordmark. Dark mode layers the white wordmark
 * over the original teal shield so the shield's dark S cutout stays intact.
 */
export function Logo({
  size = 56,
  href = "/",
  className,
  priority = false,
  onDarkSurface = false,
}: LogoProps) {
  const width = Math.round(size * (1012 / 320));
  const img = (
    <span
      className={cn("relative inline-flex shrink-0 items-center", className)}
      style={{ width, height: size }}
    >
      <Image
        src="/images/brand/logo.png"
        alt="ScamDunk"
        width={width}
        height={size}
        priority={priority}
        className="h-full w-full object-contain"
      />
      <Image
        data-logo-layer="dark-wordmark"
        src="/images/brand/logo-dark.png"
        alt=""
        aria-hidden="true"
        width={width}
        height={size}
        priority={priority}
        className={cn(
          "absolute inset-0 h-full w-full object-contain",
          onDarkSurface ? "block" : "hidden dark:block",
        )}
        style={{ clipPath: "inset(0 0 0 25%)" }}
      />
    </span>
  );

  if (!href) return img;
  return (
    <Link href={href} className="flex items-center" aria-label="ScamDunk home">
      {img}
    </Link>
  );
}

export function NavigationLogo({
  href = "/",
  className,
  priority = false,
  onDarkSurface = false,
}: Omit<LogoProps, "size">) {
  return (
    <Logo
      size={32}
      href={href}
      className={className}
      priority={priority}
      onDarkSurface={onDarkSurface}
    />
  );
}
