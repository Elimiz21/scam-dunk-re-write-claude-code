"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  onUnavailable?: () => void;
}

export function Turnstile({
  onVerify,
  onError,
  onExpire,
  onUnavailable,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Keep the latest callbacks in refs. Parents commonly pass fresh inline
  // arrow functions on every render (e.g. as the form state changes on each
  // keystroke). If the render effect depended on those callbacks it would tear
  // down and recreate the widget constantly — flicker, wasted challenges, and a
  // lost completed verification (FE-M7). By reading them from refs, the widget
  // is rendered once and the effect can depend only on [siteKey].
  const onVerifyRef = useRef(onVerify);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
    onUnavailableRef.current = onUnavailable;
  }, [onVerify, onError, onExpire, onUnavailable]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !siteKey || widgetIdRef.current) return;

    if (typeof window !== "undefined" && window.turnstile) {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        "error-callback": () => onErrorRef.current?.(),
        "expired-callback": () => onExpireRef.current?.(),
        theme: "auto",
      });
    }
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) {
      onUnavailableRef.current?.();
      return;
    }

    // Load Turnstile script if not already loaded
    if (!document.querySelector('script[src*="turnstile"]')) {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
      script.async = true;
      script.defer = true;

      window.onTurnstileLoad = () => {
        renderWidget();
      };

      document.head.appendChild(script);
    } else if (window.turnstile) {
      renderWidget();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Depends only on [siteKey] (renderWidget is itself memoized on [siteKey]),
    // so keystrokes in the parent no longer recreate the widget.
  }, [renderWidget, siteKey]);

  // Don't render anything if no site key.
  if (!siteKey) {
    return null;
  }

  return <div ref={containerRef} className="flex justify-center my-4" />;
}

export function useTurnstileReset() {
  return useCallback((widgetId: string) => {
    if (typeof window !== "undefined" && window.turnstile) {
      window.turnstile.reset(widgetId);
    }
  }, []);
}
