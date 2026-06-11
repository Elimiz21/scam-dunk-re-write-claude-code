"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";

declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function PayPalButton({ onSuccess, onError }: PayPalButtonProps) {
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{
    clientId: string;
    planId: string;
  } | null>(null);
  const router = useRouter();

  // Keep the latest callbacks/router in refs so the effects below don't need
  // them in their dependency arrays. Without this, a parent that passes fresh
  // inline arrow functions on every render would re-run config fetching and
  // tear down + re-render the PayPal button on each re-render (flicker, request
  // spam, and a reset mid-checkout).
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const routerRef = useRef(router);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    routerRef.current = router;
  }, [onSuccess, onError, router]);

  // Fetch PayPal config — runs once on mount.
  useEffect(() => {
    let cancelled = false;
    async function fetchConfig() {
      try {
        const response = await fetch("/api/billing/paypal/config");
        if (!response.ok) {
          throw new Error("PayPal not configured");
        }
        const data = await response.json();
        if (!cancelled) {
          setConfig(data);
        }
      } catch (err) {
        if (cancelled) return;
        setError("Payment system is not available. Please contact support.");
        setIsLoading(false);
        onErrorRef.current?.("PayPal configuration failed");
      }
    }
    fetchConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load PayPal SDK and render button. Depends only on [config] so it does not
  // re-run (and re-render the button) on unrelated parent re-renders.
  useEffect(() => {
    if (!config) return;

    const renderButton = () => {
      if (!window.paypal || !buttonContainerRef.current) {
        return;
      }

      // Clear any existing button
      buttonContainerRef.current.innerHTML = "";

      try {
        window.paypal
          .Buttons({
            style: {
              shape: "rect",
              color: "gold",
              layout: "vertical",
              label: "subscribe",
            },
            createSubscription: function (data: any, actions: any) {
              return actions.subscription.create({
                plan_id: config.planId,
              });
            },
            onApprove: async function (data: any) {
              try {
                // Send subscription ID to backend to activate
                const response = await fetch("/api/billing/paypal/activate", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    subscriptionId: data.subscriptionID,
                  }),
                });

                if (!response.ok) {
                  throw new Error("Failed to activate subscription");
                }

                // Success! Refresh the page or redirect
                if (onSuccessRef.current) {
                  onSuccessRef.current();
                } else {
                  routerRef.current.push("/account?upgraded=true");
                  routerRef.current.refresh();
                }
              } catch (err) {
                console.error("Error activating subscription:", err);
                setError(
                  "Subscription created but activation failed. Please contact support.",
                );
                onErrorRef.current?.("Activation failed");
              }
            },
            onError: function (err: any) {
              console.error("PayPal button error:", err);
              setError("Payment failed. Please try again.");
              onErrorRef.current?.("Payment failed");
            },
            onCancel: function () {
              // User cancelled, just log it
              console.log("User cancelled PayPal subscription");
            },
          })
          .render(buttonContainerRef.current);

        setIsLoading(false);
      } catch (err) {
        console.error("Error rendering PayPal button:", err);
        setError("Failed to initialize PayPal button.");
        setIsLoading(false);
        onErrorRef.current?.("Button render failed");
      }
    };

    const loadPayPalScript = () => {
      // Check if script is already loaded
      if (window.paypal) {
        renderButton();
        return;
      }

      // Load PayPal SDK
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${config.clientId}&vault=true&intent=subscription`;
      script.setAttribute("data-sdk-integration-source", "button-factory");
      script.async = true;

      script.onload = () => {
        renderButton();
      };

      script.onerror = () => {
        setError("Failed to load PayPal. Please try again later.");
        setIsLoading(false);
        onErrorRef.current?.("PayPal SDK failed to load");
      };

      document.body.appendChild(script);
    };

    loadPayPalScript();
  }, [config]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center justify-center p-4">
          <div className="text-sm text-muted-foreground">Loading PayPal...</div>
        </div>
      )}
      <div ref={buttonContainerRef} />
    </div>
  );
}
