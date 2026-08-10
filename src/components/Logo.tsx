import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Rendered height in pixels. Header uses 56; footer 48; auth pages 64. */
  size?: number;
  href?: string | null;
  className?: string;
  priority?: boolean;
}

/**
 * The ScamDunk brand mark (agency design, Aug 2026): shield-S icon plus
 * wordmark, shipped as a single image asset. Source of truth:
 * public/images/brand/logo.png (1012x320). Use size to scale; aspect ratio
 * is preserved.
 */
export function Logo({
  size = 56,
  href = "/",
  className,
  priority = false,
}: LogoProps) {
  const width = Math.round(size * (1012 / 320));
  const img = (
    <Image
      src="/images/brand/logo.png"
      alt="ScamDunk"
      width={width}
      height={size}
      priority={priority}
      className={cn("w-auto", className)}
      style={{ height: size }}
    />
  );
  if (!href) return img;
  return (
    <Link href={href} className="flex items-center" aria-label="ScamDunk home">
      {img}
    </Link>
  );
}
