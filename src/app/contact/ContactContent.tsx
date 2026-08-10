"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  Mail,
  MessageSquare,
  Bug,
  Lightbulb,
  CreditCard,
  HelpCircle,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  Shield,
  ArrowRight,
} from "lucide-react";

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  category?: string;
}

const categories = [
  {
    id: "SUPPORT",
    label: "Technical Support",
    description: "Get help with using ScamDunk",
    icon: HelpCircle,
  },
  {
    id: "FEEDBACK",
    label: "Feedback & Suggestions",
    description: "Share ideas to improve ScamDunk",
    icon: Lightbulb,
  },
  {
    id: "BUG_REPORT",
    label: "Report a Bug",
    description: "Something not working right?",
    icon: Bug,
  },
  {
    id: "FEATURE_REQUEST",
    label: "Feature Request",
    description: "Suggest new features",
    icon: MessageSquare,
  },
  {
    id: "BILLING",
    label: "Billing Question",
    description: "Payment or subscription issues",
    icon: CreditCard,
  },
  {
    id: "OTHER",
    label: "Other",
    description: "Anything else",
    icon: Mail,
  },
];

export default function ContactContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    subject: "",
    message: "",
    category: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [emailCopied, setEmailCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("support@scamdunk.com").then(() => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    });
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name || formData.name.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.subject || formData.subject.length < 5) {
      newErrors.subject = "Subject must be at least 5 characters";
    }

    if (!formData.message || formData.message.length < 20) {
      newErrors.message = "Message must be at least 20 characters";
    }

    if (!formData.category) {
      newErrors.category = "Please select a category";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitStatus("success");
        setTicketId(data.ticketId);
        // Reset form
        setFormData({
          name: "",
          email: "",
          subject: "",
          message: "",
          category: "",
        });
      } else {
        setSubmitStatus("error");
        setErrorMessage(
          data.error || "Failed to submit your message. Please try again.",
        );
      }
    } catch {
      setSubmitStatus("error");
      setErrorMessage(
        "Network error. Please check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const selectedCategory = categories.find((c) => c.id === formData.category);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewScan={() => {}}
      />

      <div className="flex flex-col min-h-screen">
        <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
            {/* Hero Section */}
            <div className="mb-12 md:mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Contact
              </p>
              <h1 className="font-editorial mt-4 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.1] text-foreground">
                We&apos;re here <span className="text-brand-blue">for you.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Have a question, suggestion, or need help? Our team typically
                responds within 1-2 business days.
              </p>
            </div>

            {/* Success Message */}
            {submitStatus === "success" && (
              <div className="mb-8 p-5 rounded-xl border border-green-500/30 bg-green-500/5">
                <div className="flex items-start gap-4">
                  <CheckCircle className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      Message Sent Successfully!
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground mb-2">
                      Thank you for reaching out. We&apos;ve received your
                      message and will get back to you soon.
                    </p>
                    {ticketId && (
                      <p className="text-[13px] text-muted-foreground">
                        Your ticket ID:{" "}
                        <code className="rounded bg-secondary px-2 py-0.5 font-mono text-foreground">
                          {ticketId}
                        </code>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {submitStatus === "error" && (
              <div className="mb-8 p-5 rounded-xl border border-destructive/30 bg-destructive/5">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground mb-1">
                      Something went wrong
                    </h3>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {errorMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Form */}
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Form Section */}
              <div className="lg:col-span-2">
                <div className="p-6 rounded-2xl border border-border bg-card">
                  <div className="mb-6 pb-5 border-b border-border">
                    <h2 className="font-editorial text-2xl leading-tight text-foreground">
                      Submit your request
                    </h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Fill out the form below and we&apos;ll get back to you
                    </p>
                  </div>

                  <form
                    id="contact-form"
                    onSubmit={handleSubmit}
                    className="space-y-6"
                  >
                    {/* Category Selection */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-3">
                        What can we help you with?{" "}
                        <span className="text-destructive">*</span>
                      </label>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {categories.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() =>
                              handleInputChange("category", category.id)
                            }
                            className={`p-4 rounded-xl border text-left transition-colors ${
                              formData.category === category.id
                                ? "border-foreground bg-secondary/70"
                                : "border-border hover:border-foreground/40"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <category.icon className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                              <div>
                                <p className="text-[13px] font-semibold text-foreground">
                                  {category.label}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {category.description}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      {errors.category && (
                        <p className="text-destructive text-sm mt-2">
                          {errors.category}
                        </p>
                      )}
                    </div>

                    {/* Name & Email */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="name"
                          className="block text-sm font-medium text-foreground mb-2"
                        >
                          Your Name <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          id="name"
                          value={formData.name}
                          onChange={(e) =>
                            handleInputChange("name", e.target.value)
                          }
                          className={`w-full px-4 py-3 rounded-xl border bg-background text-sm text-foreground transition-colors ${
                            errors.name
                              ? "border-destructive focus:border-destructive"
                              : "border-border focus:border-foreground/50"
                          } focus:outline-none`}
                          placeholder="John Doe"
                        />
                        {errors.name && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.name}
                          </p>
                        )}
                      </div>
                      <div>
                        <label
                          htmlFor="email"
                          className="block text-sm font-medium text-foreground mb-2"
                        >
                          Email Address{" "}
                          <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="email"
                          id="email"
                          value={formData.email}
                          onChange={(e) =>
                            handleInputChange("email", e.target.value)
                          }
                          className={`w-full px-4 py-3 rounded-xl border bg-background text-sm text-foreground transition-colors ${
                            errors.email
                              ? "border-destructive focus:border-destructive"
                              : "border-border focus:border-foreground/50"
                          } focus:outline-none`}
                          placeholder="john@example.com"
                        />
                        {errors.email && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Subject */}
                    <div>
                      <label
                        htmlFor="subject"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Subject <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        id="subject"
                        value={formData.subject}
                        onChange={(e) =>
                          handleInputChange("subject", e.target.value)
                        }
                        className={`w-full px-4 py-3 rounded-xl border bg-background text-sm text-foreground transition-colors ${
                          errors.subject
                            ? "border-destructive focus:border-destructive"
                            : "border-border focus:border-foreground/50"
                        } focus:outline-none`}
                        placeholder={
                          selectedCategory?.id === "BUG_REPORT"
                            ? "Describe the issue briefly..."
                            : selectedCategory?.id === "FEATURE_REQUEST"
                              ? "What feature would you like?"
                              : "Brief summary of your message"
                        }
                      />
                      {errors.subject && (
                        <p className="text-destructive text-sm mt-1">
                          {errors.subject}
                        </p>
                      )}
                    </div>

                    {/* Message */}
                    <div>
                      <label
                        htmlFor="message"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Message <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        id="message"
                        value={formData.message}
                        onChange={(e) =>
                          handleInputChange("message", e.target.value)
                        }
                        rows={6}
                        className={`w-full px-4 py-3 rounded-xl border bg-background text-sm text-foreground transition-colors resize-none ${
                          errors.message
                            ? "border-destructive focus:border-destructive"
                            : "border-border focus:border-foreground/50"
                        } focus:outline-none`}
                        placeholder={
                          selectedCategory?.id === "BUG_REPORT"
                            ? "Please describe the bug in detail. Include steps to reproduce, what you expected to happen, and what actually happened..."
                            : selectedCategory?.id === "FEATURE_REQUEST"
                              ? "Describe the feature you'd like to see and how it would help you..."
                              : selectedCategory?.id === "FEEDBACK"
                                ? "We'd love to hear your thoughts on how we can improve..."
                                : "Tell us more about your question or request..."
                        }
                      />
                      {errors.message && (
                        <p className="text-destructive text-sm mt-1">
                          {errors.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formData.message.length}/5000 characters
                      </p>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-pill btn-pill-primary w-full sm:w-auto gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Send Message
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Information Sidebar */}
              <div className="space-y-4">
                {/* Response Time */}
                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2.5 mb-2">
                    <Clock className="h-4 w-4 text-teal" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Response Time
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    We typically respond within 1-2 business days. Urgent issues
                    are prioritized.
                  </p>
                </div>

                {/* Privacy Note */}
                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2.5 mb-2">
                    <Shield className="h-4 w-4 text-teal" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Your Privacy
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Your information is secure and will only be used to respond
                    to your inquiry.
                  </p>
                </div>

                {/* Quick Links */}
                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2.5 mb-3">
                    <HelpCircle className="h-4 w-4 text-teal" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Quick Links
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <Link
                      href="/help"
                      className="flex items-center gap-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                    >
                      Help &amp; FAQ
                      <ArrowRight className="h-3 w-3 ml-auto" />
                    </Link>
                    <Link
                      href="/how-it-works"
                      className="flex items-center gap-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                    >
                      How It Works
                      <ArrowRight className="h-3 w-3 ml-auto" />
                    </Link>
                    <Link
                      href="/about"
                      className="flex items-center gap-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                    >
                      About Us
                      <ArrowRight className="h-3 w-3 ml-auto" />
                    </Link>
                  </div>
                </div>

                {/* Direct Email */}
                <div className="p-5 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2.5 mb-2">
                    <Mail className="h-4 w-4 text-teal" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Direct Email
                    </h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground mb-2">
                    Prefer to email us directly?
                  </p>
                  <button
                    onClick={handleCopyEmail}
                    className="flex items-center gap-2 text-[13px] font-medium text-foreground transition-colors hover:text-teal"
                    title="Copy email address"
                  >
                    {emailCopied ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span className="text-success">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        support@scamdunk.com
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
