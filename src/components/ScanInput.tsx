"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  TrendingUp,
  Bitcoin,
  MessageSquare,
  Upload,
  CheckSquare,
  ChevronDown,
  X,
  Loader2,
  AlertCircle,
  Check,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type AssetType = "stock" | "crypto";

interface ScanInputProps {
  onSubmit: (data: {
    ticker: string;
    assetType: AssetType;
    pitchText?: string;
    context?: {
      unsolicited: boolean;
      promisesHighReturns: boolean;
      urgencyPressure: boolean;
      secrecyInsideInfo: boolean;
    };
  }) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

// Valid ticker patterns
const STOCK_TICKER_PATTERN = /^[A-Z]{1,5}$/;
const CRYPTO_TICKER_PATTERN = /^[A-Z]{2,10}$/;

export function ScanInput({ onSubmit, isLoading, disabled }: ScanInputProps) {
  const [ticker, setTicker] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showPitchInput, setShowPitchInput] = useState(false);
  const [showContextFlags, setShowContextFlags] = useState(false);
  const [pitchText, setPitchText] = useState("");
  const [pitchAdded, setPitchAdded] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [context, setContext] = useState({
    unsolicited: false,
    promisesHighReturns: false,
    urgencyPressure: false,
    secrecyInsideInfo: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { addToast } = useToast();

  // Focus textarea when pitch input opens
  useEffect(() => {
    if (showPitchInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showPitchInput]);

  const validateTicker = (value: string): string | null => {
    if (!value.trim()) {
      return "Please enter a ticker symbol";
    }

    const pattern = assetType === "stock" ? STOCK_TICKER_PATTERN : CRYPTO_TICKER_PATTERN;
    if (!pattern.test(value.trim().toUpperCase())) {
      if (assetType === "stock") {
        return "Invalid ticker format. Stock tickers are 1-5 letters (e.g., AAPL, TSLA)";
      } else {
        return "Invalid symbol format. Crypto symbols are 2-10 letters (e.g., BTC, ETH)";
      }
    }

    return null;
  };

  const handleTickerChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setTicker(upperValue);
    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateTicker(ticker);
    if (error) {
      setValidationError(error);
      inputRef.current?.focus();
      return;
    }

    if (isLoading || disabled) return;

    onSubmit({
      ticker: ticker.trim().toUpperCase(),
      assetType,
      pitchText: pitchText.trim() || undefined,
      context: Object.values(context).some(Boolean) ? context : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showPitchInput) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleContext = (key: keyof typeof context) => {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePitchSubmit = () => {
    if (pitchText.trim()) {
      setPitchAdded(true);
      setShowPitchInput(false);
      addToast({
        type: "success",
        title: "Pitch added",
        description: "Your pitch will be analyzed with the stock scan for behavioral red flags.",
      });
    } else {
      setShowPitchInput(false);
    }
  };

  const handleClearPitch = () => {
    setPitchText("");
    setPitchAdded(false);
    setShowPitchInput(false);
    addToast({
      type: "info",
      title: "Pitch removed",
    });
  };

  const handleContextDone = () => {
    setShowContextFlags(false);
    const count = Object.values(context).filter(Boolean).length;
    if (count > 0) {
      addToast({
        type: "info",
        title: `${count} red flag${count > 1 ? "s" : ""} selected`,
        description: "These will be factored into the risk analysis.",
      });
    }
  };

  const handleUploadClick = () => {
    addToast({
      type: "info",
      title: "Coming soon",
      description: "Document upload will be available in a future update.",
    });
  };

  const contextLabels = {
    unsolicited: "Unsolicited tip",
    promisesHighReturns: "Promises high returns",
    urgencyPressure: "Urgency/pressure",
    secrecyInsideInfo: "Claims inside info",
  };

  const contextDescriptions = {
    unsolicited: "You didn't ask for this investment advice",
    promisesHighReturns: "Claims of guaranteed or unusually high returns",
    urgencyPressure: "Pressure to act quickly or miss out",
    secrecyInsideInfo: "Claims of exclusive or insider information",
  };

  const activeContextCount = Object.values(context).filter(Boolean).length;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Validation Error */}
      {validationError && (
        <div className="mb-3 animate-fade-in">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{validationError}</span>
            <button
              onClick={() => setValidationError("")}
              className="ml-auto p-1 hover:bg-destructive/10 rounded"
              aria-label="Dismiss error"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Pitch Text Input (expandable) */}
      {showPitchInput && (
        <div className="mb-3 animate-fade-in">
          <div className="relative">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card rounded-t-2xl">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Add Investment Pitch</span>
            </div>
            <textarea
              ref={textareaRef}
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
              placeholder="Paste the pitch or message you received about this investment. We'll analyze it for common scam language patterns like guaranteed returns, urgency tactics, and insider info claims..."
              className="w-full min-h-[120px] p-4 rounded-b-2xl bg-card border border-t-0 border-border resize-none focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              disabled={isLoading || disabled}
              aria-label="Investment pitch text"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPitchInput(false);
                  if (!pitchText.trim()) setPitchAdded(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handlePitchSubmit}
                disabled={!pitchText.trim()}
              >
                <Check className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pitch Added Indicator */}
      {pitchAdded && !showPitchInput && pitchText.trim() && (
        <div className="mb-3 animate-fade-in">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="flex-1 truncate">
              Pitch added: &ldquo;{pitchText.slice(0, 50)}{pitchText.length > 50 ? "..." : ""}&rdquo;
            </span>
            <button
              onClick={() => setShowPitchInput(true)}
              className="text-primary hover:underline text-xs"
            >
              Edit
            </button>
            <button
              onClick={handleClearPitch}
              className="p-1 hover:bg-primary/10 rounded"
              aria-label="Remove pitch"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Context Flags (expandable) */}
      {showContextFlags && (
        <div className="mb-3 animate-fade-in">
          <div className="p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Red Flag Indicators</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Select any that apply to how you received this investment tip. These factors increase the risk score.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(contextLabels).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleContext(key as keyof typeof context)}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl text-left transition-smooth",
                    context[key as keyof typeof context]
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/80"
                  )}
                  disabled={isLoading || disabled}
                  aria-pressed={context[key as keyof typeof context]}
                  aria-label={`${label}: ${contextDescriptions[key as keyof typeof contextDescriptions]}`}
                >
                  <div
                    className={cn(
                      "h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5",
                      context[key as keyof typeof context]
                        ? "bg-primary-foreground border-primary-foreground"
                        : "border-muted-foreground"
                    )}
                  >
                    {context[key as keyof typeof context] && (
                      <Check className="h-3 w-3 text-primary" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium">{label}</span>
                    <p className={cn(
                      "text-xs mt-0.5",
                      context[key as keyof typeof context]
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    )}>
                      {contextDescriptions[key as keyof typeof contextDescriptions]}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Red Flags Advice */}
            {activeContextCount > 0 && (
              <div className="mt-4 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-orange-800 dark:text-orange-200">
                    <p className="font-medium mb-1">
                      {activeContextCount} warning sign{activeContextCount > 1 ? "s" : ""} detected
                    </p>
                    <p>
                      {activeContextCount >= 3
                        ? "Multiple red flags suggest this could be a scam. Proceed with extreme caution."
                        : activeContextCount >= 2
                        ? "These are common tactics used in pump-and-dump schemes. Be very careful."
                        : "This is a potential warning sign. The analysis will factor this in."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <Button
                type="button"
                size="sm"
                onClick={handleContextDone}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Input Bar */}
      <form onSubmit={handleSubmit}>
        <div className="input-bar p-2">
          <div className="flex items-center gap-2">
            {/* Asset Type Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-smooth",
                  "bg-secondary hover:bg-secondary/80"
                )}
                disabled={isLoading || disabled}
                aria-haspopup="listbox"
                aria-expanded={showTypeDropdown}
                aria-label={`Asset type: ${assetType === "stock" ? "Stock" : "Crypto"}`}
              >
                {assetType === "stock" ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <Bitcoin className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {assetType === "stock" ? "Stock" : "Crypto"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {showTypeDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowTypeDropdown(false)}
                  />
                  <div
                    className="absolute top-full left-0 mt-1 p-1 rounded-xl bg-card border border-border shadow-lg z-20 animate-fade-in"
                    role="listbox"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAssetType("stock");
                        setShowTypeDropdown(false);
                        setValidationError("");
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-smooth",
                        assetType === "stock"
                          ? "bg-secondary"
                          : "hover:bg-secondary"
                      )}
                      role="option"
                      aria-selected={assetType === "stock"}
                    >
                      <TrendingUp className="h-4 w-4" />
                      Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssetType("crypto");
                        setShowTypeDropdown(false);
                        setValidationError("");
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-smooth",
                        assetType === "crypto"
                          ? "bg-secondary"
                          : "hover:bg-secondary"
                      )}
                      role="option"
                      aria-selected={assetType === "crypto"}
                    >
                      <Bitcoin className="h-4 w-4" />
                      Crypto
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Ticker Input */}
            <input
              ref={inputRef}
              type="text"
              value={ticker}
              onChange={(e) => handleTickerChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                assetType === "stock"
                  ? "Enter stock ticker (e.g., AAPL, TSLA)"
                  : "Enter crypto symbol (e.g., BTC, ETH)"
              }
              className={cn(
                "flex-1 bg-transparent border-none outline-none text-sm px-2 py-2 placeholder:text-muted-foreground",
                validationError && "text-destructive"
              )}
              disabled={isLoading || disabled}
              maxLength={10}
              aria-label="Ticker symbol"
              aria-invalid={!!validationError}
              aria-describedby={validationError ? "ticker-error" : undefined}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              size="icon"
              disabled={!ticker.trim() || isLoading || disabled}
              className="h-10 w-10 rounded-xl shrink-0"
              aria-label="Analyze ticker"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (pitchAdded && pitchText.trim()) {
                  setShowPitchInput(true);
                } else {
                  setShowPitchInput(!showPitchInput);
                }
              }}
              className={cn(
                "gap-1.5 rounded-xl text-xs",
                (showPitchInput || pitchAdded) && "text-primary"
              )}
              disabled={isLoading || disabled}
              aria-label="Add investment pitch"
              aria-expanded={showPitchInput}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Pitch</span>
              {pitchAdded && (
                <Check className="h-3 w-3 text-green-500" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl text-xs opacity-50 cursor-not-allowed"
              onClick={handleUploadClick}
              aria-label="Upload document - coming soon"
              aria-disabled="true"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Upload</span>
              <span className="text-[10px] px-1 py-0.5 rounded bg-muted">Soon</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowContextFlags(!showContextFlags)}
              className={cn(
                "gap-1.5 rounded-xl text-xs",
                activeContextCount > 0 && "text-primary"
              )}
              disabled={isLoading || disabled}
              aria-label="Select red flag indicators"
              aria-expanded={showContextFlags}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Red Flags</span>
              {activeContextCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">
                  {activeContextCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
