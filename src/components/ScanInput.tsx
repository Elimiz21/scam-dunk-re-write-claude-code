"use client";

import { useState, useRef } from "react";
import {
  Send,
  TrendingUp,
  Bitcoin,
  MessageSquare,
  Upload,
  CheckSquare,
  ChevronDown,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function ScanInput({ onSubmit, isLoading, disabled }: ScanInputProps) {
  const [ticker, setTicker] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showPitchInput, setShowPitchInput] = useState(false);
  const [showContextFlags, setShowContextFlags] = useState(false);
  const [pitchText, setPitchText] = useState("");
  const [context, setContext] = useState({
    unsolicited: false,
    promisesHighReturns: false,
    urgencyPressure: false,
    secrecyInsideInfo: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim() || isLoading || disabled) return;

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

  const contextLabels = {
    unsolicited: "Unsolicited tip",
    promisesHighReturns: "Promises high returns",
    urgencyPressure: "Urgency/pressure",
    secrecyInsideInfo: "Claims inside info",
  };

  const activeContextCount = Object.values(context).filter(Boolean).length;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Pitch Text Input (expandable) */}
      {showPitchInput && (
        <div className="mb-3 animate-fade-in">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
              placeholder="Paste the pitch or message you received about this investment..."
              className="w-full min-h-[120px] p-4 pr-10 rounded-2xl bg-card border border-border resize-none focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              disabled={isLoading || disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={() => {
                setShowPitchInput(false);
                setPitchText("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Context Flags (expandable) */}
      {showContextFlags && (
        <div className="mb-3 animate-fade-in">
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-sm font-medium mb-3">
              Check any that apply to how you received this tip:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(contextLabels).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleContext(key as keyof typeof context)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl text-sm transition-smooth",
                    context[key as keyof typeof context]
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/80"
                  )}
                  disabled={isLoading || disabled}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center",
                      context[key as keyof typeof context]
                        ? "bg-primary-foreground border-primary-foreground"
                        : "border-muted-foreground"
                    )}
                  >
                    {context[key as keyof typeof context] && (
                      <CheckSquare className="h-3 w-3 text-primary" />
                    )}
                  </div>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowContextFlags(false)}
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
                <div className="absolute top-full left-0 mt-1 p-1 rounded-xl bg-card border border-border shadow-lg z-10 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      setAssetType("stock");
                      setShowTypeDropdown(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-smooth",
                      assetType === "stock"
                        ? "bg-secondary"
                        : "hover:bg-secondary"
                    )}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetType("crypto");
                      setShowTypeDropdown(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-smooth",
                      assetType === "crypto"
                        ? "bg-secondary"
                        : "hover:bg-secondary"
                    )}
                  >
                    <Bitcoin className="h-4 w-4" />
                    Crypto
                  </button>
                </div>
              )}
            </div>

            {/* Ticker Input */}
            <input
              ref={inputRef}
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder={
                assetType === "stock"
                  ? "Enter stock ticker (e.g., AAPL, TSLA)"
                  : "Enter crypto symbol (e.g., BTC, ETH)"
              }
              className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-2 placeholder:text-muted-foreground"
              disabled={isLoading || disabled}
              maxLength={10}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              size="icon"
              disabled={!ticker.trim() || isLoading || disabled}
              className="h-10 w-10 rounded-xl shrink-0"
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
              onClick={() => setShowPitchInput(!showPitchInput)}
              className={cn(
                "gap-1.5 rounded-xl text-xs",
                showPitchInput || pitchText ? "text-primary" : ""
              )}
              disabled={isLoading || disabled}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Pitch</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              disabled={isLoading || disabled}
              title="Coming soon"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Upload</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowContextFlags(!showContextFlags)}
              className={cn(
                "gap-1.5 rounded-xl text-xs",
                activeContextCount > 0 ? "text-primary" : ""
              )}
              disabled={isLoading || disabled}
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
