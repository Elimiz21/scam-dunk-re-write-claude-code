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

  // Fetch PayPal config
  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch("/api/billing/paypal/config");
        if (!response.ok) {
          throw new Error("PayPal not configured");
        }
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        setError("Payment system is not available. Please contact support.");
        setIsLoading(false);
        if (onError) {
          onError("PayPal configuration failed");
        }
      }
    }
    fetchConfig();
  }, [onError]);

  // Load PayPal SDK and render button
  useEffect(() => {
    if (!config) return;

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
        if (onError) {
          onError("PayPal SDK failed to load");
        }
      };

      document.body.appendChild(script);
    };

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
            onApprove: async function (data: any, actions: any) {
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
                if (onSuccess) {
                  onSuccess();
                } else {
                  router.push("/account?upgraded=true");
                  router.refresh();
                }
              } catch (err) {
                console.error("Error activating subscription:", err);
                setError("Subscription created but activation failed. Please contact support.");
                if (onError) {
                  onError("Activation failed");
                }
              }
            },
            onError: function (err: any) {
              console.error("PayPal button error:", err);
              setError("Payment failed. Please try again.");
              if (onError) {
                onError("Payment failed");
              }
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
        if (onError) {
          onError("Button render failed");
        }
      }
    };

    loadPayPalScript();
  }, [config, router, onSuccess, onError]);

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
