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
  Image as ImageIcon,
  FileText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureTooltip } from "@/components/ui/feature-tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type AssetType = "stock" | "crypto";

interface UploadedFile {
  file: File;
  preview: string;
  type: "image" | "text";
}

interface ScanInputProps {
  onSubmit: (data: {
    ticker: string;
    assetType: AssetType;
    pitchText?: string;
    chatImages?: File[];
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

// Accepted file types
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

export function ScanInput({ onSubmit, isLoading, disabled }: ScanInputProps) {
  const [ticker, setTicker] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showChatInput, setShowChatInput] = useState(false);
  const [showContextFlags, setShowContextFlags] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatAdded, setChatAdded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [validationError, setValidationError] = useState("");
  const [context, setContext] = useState({
    unsolicited: false,
    promisesHighReturns: false,
    urgencyPressure: false,
    secrecyInsideInfo: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  // Focus textarea when chat input opens
  useEffect(() => {
    if (showChatInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showChatInput]);

  // Cleanup file previews on unmount
  useEffect(() => {
    return () => {
      uploadedFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    };
  }, [uploadedFiles]);

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
      pitchText: chatText.trim() || undefined,
      chatImages: uploadedFiles.length > 0 ? uploadedFiles.map((f) => f.file) : undefined,
      context: Object.values(context).some(Boolean) ? context : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showChatInput) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleContext = (key: keyof typeof context) => {
    setContext((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_FILES - uploadedFiles.length;
    if (remainingSlots <= 0) {
      addToast({
        type: "warning",
        title: "Maximum files reached",
        description: `You can upload up to ${MAX_FILES} files.`,
      });
      return;
    }

    const newFiles: UploadedFile[] = [];
    const errors: string[] = [];

    Array.from(files).slice(0, remainingSlots).forEach((file) => {
      // Validate file type
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Only images are supported.`);
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large. Maximum size is 10MB.`);
        return;
      }

      newFiles.push({
        file,
        preview: URL.createObjectURL(file),
        type: "image",
      });
    });

    if (errors.length > 0) {
      addToast({
        type: "error",
        title: "Upload error",
        description: errors[0],
      });
    }

    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      setChatAdded(true);
      addToast({
        type: "success",
        title: `${newFiles.length} file${newFiles.length > 1 ? "s" : ""} added`,
        description: "Screenshots will be analyzed for scam patterns.",
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleChatSubmit = () => {
    if (chatText.trim() || uploadedFiles.length > 0) {
      setChatAdded(true);
      setShowChatInput(false);
      addToast({
        type: "success",
        title: "Chat added",
        description: "Your chat will be analyzed for scam red flags.",
      });
    } else {
      setShowChatInput(false);
    }
  };

  const handleClearChat = () => {
    setChatText("");
    uploadedFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    setUploadedFiles([]);
    setChatAdded(false);
    setShowChatInput(false);
    addToast({
      type: "info",
      title: "Chat removed",
    });
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Process dropped files
    const remainingSlots = MAX_FILES - uploadedFiles.length;
    if (remainingSlots <= 0) {
      addToast({
        type: "warning",
        title: "Maximum files reached",
        description: `You can upload up to ${MAX_FILES} files.`,
      });
      return;
    }

    const newFiles: UploadedFile[] = [];
    const errors: string[] = [];

    Array.from(files).slice(0, remainingSlots).forEach((file) => {
      // Validate file type
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Only images are supported.`);
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large. Maximum size is 10MB.`);
        return;
      }

      newFiles.push({
        file,
        preview: URL.createObjectURL(file),
        type: "image",
      });
    });

    if (errors.length > 0) {
      addToast({
        type: "error",
        title: "Upload error",
        description: errors[0],
      });
    }

    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      setChatAdded(true);
      addToast({
        type: "success",
        title: `${newFiles.length} file${newFiles.length > 1 ? "s" : ""} dropped`,
        description: "Screenshots will be analyzed for scam patterns.",
      });
    }
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
  const hasChatContent = chatText.trim() || uploadedFiles.length > 0;

  return (
    <div
      className="w-full max-w-3xl mx-auto"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="drop-zone drop-zone-active p-12 text-center max-w-md">
            <div className="mb-4 p-4 rounded-2xl bg-primary/10 w-fit mx-auto">
              <Upload className="h-12 w-12 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Drop your screenshots here</h3>
            <p className="text-muted-foreground text-sm">
              We&apos;ll analyze them for scam red flags
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              PNG, JPG, GIF, WebP - Max 10MB each
            </p>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload chat screenshots"
      />

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

      {/* Chat Input (expandable) */}
      {showChatInput && (
        <div className="mb-3 animate-fade-in">
          <div className="relative">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card rounded-t-2xl">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Add Chat / Message</span>
            </div>

            {/* Uploaded Images Preview */}
            {uploadedFiles.length > 0 && (
              <div className="p-3 bg-card border-x border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  Uploaded screenshots ({uploadedFiles.length}/{MAX_FILES})
                </p>
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border"
                    >
                      <img
                        src={file.preview}
                        alt={`Screenshot ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove screenshot ${index + 1}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {uploadedFiles.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={handleUploadClick}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      <span className="text-[10px]">Add more</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Paste the chat or message you received about this investment. You can also upload screenshots above..."
              className={cn(
                "w-full min-h-[120px] p-4 bg-card border border-border resize-none focus:outline-none focus:ring-2 focus:ring-ring text-sm",
                uploadedFiles.length > 0 ? "border-t-0 rounded-b-2xl" : "border-t-0 rounded-b-2xl"
              )}
              disabled={isLoading || disabled}
              aria-label="Chat text content"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUploadClick}
                disabled={uploadedFiles.length >= MAX_FILES}
              >
                <ImageIcon className="h-4 w-4 mr-1" />
                Add Image
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowChatInput(false);
                  if (!hasChatContent) setChatAdded(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleChatSubmit}
                disabled={!hasChatContent}
              >
                <Check className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Added Indicator */}
      {chatAdded && !showChatInput && hasChatContent && (
        <div className="mb-3 animate-fade-in">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {uploadedFiles.length > 0 && (
                <div className="flex items-center gap-1 mb-1">
                  <ImageIcon className="h-3 w-3" />
                  <span className="text-xs">{uploadedFiles.length} screenshot{uploadedFiles.length > 1 ? "s" : ""}</span>
                </div>
              )}
              {chatText.trim() && (
                <span className="truncate block">
                  &ldquo;{chatText.slice(0, 50)}{chatText.length > 50 ? "..." : ""}&rdquo;
                </span>
              )}
            </div>
            <button
              onClick={() => setShowChatInput(true)}
              className="text-primary hover:underline text-xs"
            >
              Edit
            </button>
            <button
              onClick={handleClearChat}
              className="p-1 hover:bg-primary/10 rounded"
              aria-label="Remove chat"
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
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
            {/* Add Chat - Highlighted Feature */}
            <FeatureTooltip
              title="Paste Chat Messages"
              description="Got a suspicious investment tip via WhatsApp, Telegram, or text? Paste it here for AI-powered scam detection."
              steps={[
                "Copy the chat from WhatsApp or Telegram",
                "Click this button to open the text box",
                "Paste the conversation and click 'Add'",
              ]}
              position="top"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (chatAdded && hasChatContent) {
                    setShowChatInput(true);
                  } else {
                    setShowChatInput(!showChatInput);
                  }
                }}
                className={cn(
                  "gap-1.5 rounded-xl text-xs relative",
                  "feature-highlight",
                  (showChatInput || chatAdded) && "text-primary bg-primary/15 border-primary/30"
                )}
                disabled={isLoading || disabled}
                aria-label="Add chat or message"
                aria-expanded={showChatInput}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add Chat</span>
                <Sparkles className="h-3 w-3 text-blue-500 hidden sm:block" />
                {chatAdded && (
                  <Check className="h-3 w-3 text-green-500" />
                )}
              </Button>
            </FeatureTooltip>

            {/* Upload Screenshots - Highlighted Feature */}
            <FeatureTooltip
              title="Upload Screenshots"
              description="Have screenshots of suspicious messages? Drag & drop or click to upload them for visual analysis."
              steps={[
                "Take a screenshot of the suspicious message",
                "Drag the image here or click to browse",
                "Upload up to 5 images (10MB each)",
              ]}
              position="top"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-1.5 rounded-xl text-xs relative",
                  "feature-highlight",
                  uploadedFiles.length > 0 && "text-primary bg-primary/15 border-primary/30"
                )}
                onClick={handleUploadClick}
                disabled={isLoading || disabled || uploadedFiles.length >= MAX_FILES}
                aria-label="Upload screenshot - drag and drop supported"
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Upload</span>
                <Sparkles className="h-3 w-3 text-purple-500 hidden sm:block" />
                {uploadedFiles.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">
                    {uploadedFiles.length}
                  </span>
                )}
              </Button>
            </FeatureTooltip>

            {/* Divider */}
            <div className="h-4 w-px bg-border mx-1" />

            {/* Red Flags - Normal button */}
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
