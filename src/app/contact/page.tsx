"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
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
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950",
  },
  {
    id: "FEEDBACK",
    label: "Feedback & Suggestions",
    description: "Share ideas to improve ScamDunk",
    icon: Lightbulb,
    color: "text-yellow-500",
    bgColor: "bg-yellow-50 dark:bg-yellow-950",
  },
  {
    id: "BUG_REPORT",
    label: "Report a Bug",
    description: "Something not working right?",
    icon: Bug,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950",
  },
  {
    id: "FEATURE_REQUEST",
    label: "Feature Request",
    description: "Suggest new features",
    icon: MessageSquare,
    color: "text-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-950",
  },
  {
    id: "BILLING",
    label: "Billing Question",
    description: "Payment or subscription issues",
    icon: CreditCard,
    color: "text-green-500",
    bgColor: "bg-green-50 dark:bg-green-950",
  },
  {
    id: "OTHER",
    label: "Other",
    description: "Anything else",
    icon: Mail,
    color: "text-gray-500",
    bgColor: "bg-gray-50 dark:bg-gray-950",
  },
];

export default function ContactPage() {
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
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

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
        setErrorMessage(data.error || "Failed to submit your message. Please try again.");
      }
    } catch {
      setSubmitStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
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

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Hero Section */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-2xl mb-6">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">Contact Us</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Have a question, suggestion, or need help? We&apos;re here for you.
                Our team typically responds within 1-2 business days.
              </p>
            </div>

            {/* Success Message */}
            {submitStatus === "success" && (
              <div className="mb-8 p-6 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                      Message Sent Successfully!
                    </h3>
                    <p className="text-green-800 dark:text-green-200 text-sm mb-2">
                      Thank you for reaching out. We&apos;ve received your message and will get back to you soon.
                    </p>
                    {ticketId && (
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        Your ticket ID: <code className="bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded font-mono">{ticketId}</code>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {submitStatus === "error" && (
              <div className="mb-8 p-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-900 dark:text-red-100 mb-1">
                      Something went wrong
                    </h3>
                    <p className="text-red-800 dark:text-red-200 text-sm">
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
                {/* Form Container with distinct styling */}
                <div className="p-6 rounded-2xl bg-card border-2 border-primary/20 shadow-sm">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <Send className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-lg">Submit Your Request</h2>
                      <p className="text-sm text-muted-foreground">Fill out the form below and we&apos;ll get back to you</p>
                    </div>
                  </div>

                  <form id="contact-form" onSubmit={handleSubmit} className="space-y-6">
                    {/* Category Selection */}
                    <div>
                      <label className="block text-sm font-medium mb-3">
                        What can we help you with? <span className="text-destructive">*</span>
                      </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => handleInputChange("category", category.id)}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            formData.category === category.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-secondary/50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${category.bgColor}`}>
                              <category.icon className={`h-5 w-5 ${category.color}`} />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{category.label}</p>
                              <p className="text-xs text-muted-foreground">{category.description}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {errors.category && (
                      <p className="text-destructive text-sm mt-2">{errors.category}</p>
                    )}
                  </div>

                  {/* Name & Email */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium mb-2">
                        Your Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border bg-background transition-colors ${
                          errors.name
                            ? "border-destructive focus:border-destructive"
                            : "border-border focus:border-primary"
                        } focus:outline-none focus:ring-2 focus:ring-primary/20`}
                        placeholder="John Doe"
                      />
                      {errors.name && (
                        <p className="text-destructive text-sm mt-1">{errors.name}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-2">
                        Email Address <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border bg-background transition-colors ${
                          errors.email
                            ? "border-destructive focus:border-destructive"
                            : "border-border focus:border-primary"
                        } focus:outline-none focus:ring-2 focus:ring-primary/20`}
                        placeholder="john@example.com"
                      />
                      {errors.email && (
                        <p className="text-destructive text-sm mt-1">{errors.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium mb-2">
                      Subject <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      id="subject"
                      value={formData.subject}
                      onChange={(e) => handleInputChange("subject", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border bg-background transition-colors ${
                        errors.subject
                          ? "border-destructive focus:border-destructive"
                          : "border-border focus:border-primary"
                      } focus:outline-none focus:ring-2 focus:ring-primary/20`}
                      placeholder={
                        selectedCategory?.id === "BUG_REPORT"
                          ? "Describe the issue briefly..."
                          : selectedCategory?.id === "FEATURE_REQUEST"
                          ? "What feature would you like?"
                          : "Brief summary of your message"
                      }
                    />
                    {errors.subject && (
                      <p className="text-destructive text-sm mt-1">{errors.subject}</p>
                    )}
                  </div>

                  {/* Message */}
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium mb-2">
                      Message <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => handleInputChange("message", e.target.value)}
                      rows={6}
                      className={`w-full px-4 py-3 rounded-xl border bg-background transition-colors resize-none ${
                        errors.message
                          ? "border-destructive focus:border-destructive"
                          : "border-border focus:border-primary"
                      } focus:outline-none focus:ring-2 focus:ring-primary/20`}
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
                      <p className="text-destructive text-sm mt-1">{errors.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.message.length}/5000 characters
                    </p>
                  </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto px-8 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5" />
                          Send Message
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Information Sidebar */}
              <div className="space-y-4">
                {/* Information Header */}
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Information</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Helpful details about contacting our support team
                  </p>
                </div>

                {/* Response Time */}
                <div className="p-5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100">Response Time</h3>
                  </div>
                  <p className="text-sm text-blue-800/80 dark:text-blue-200/80">
                    We typically respond within 1-2 business days. Urgent issues are prioritized.
                  </p>
                </div>

                {/* Privacy Note */}
                <div className="p-5 rounded-xl bg-green-50/50 dark:bg-green-950/30 border border-green-200/50 dark:border-green-800/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                      <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="font-semibold text-green-900 dark:text-green-100">Your Privacy</h3>
                  </div>
                  <p className="text-sm text-green-800/80 dark:text-green-200/80">
                    Your information is secure and will only be used to respond to your inquiry.
                  </p>
                </div>

                {/* Quick Links */}
                <div className="p-5 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                      <HelpCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="font-semibold text-purple-900 dark:text-purple-100">Quick Links</h3>
                  </div>
                  <div className="space-y-2">
                    <Link
                      href="/help"
                      className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Help & FAQ
                      <ArrowRight className="h-3 w-3 ml-auto" />
                    </Link>
                    <Link
                      href="/how-it-works"
                      className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                    >
                      <MessageSquare className="h-4 w-4" />
                      How It Works
                      <ArrowRight className="h-3 w-3 ml-auto" />
                    </Link>
                    <Link
                      href="/about"
                      className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                    >
                      <Mail className="h-4 w-4" />
                      About Us
                      <ArrowRight className="h-3 w-3 ml-auto" />
                    </Link>
                  </div>
                </div>

                {/* Direct Email */}
                <div className="p-5 rounded-xl bg-orange-50/50 dark:bg-orange-950/30 border border-orange-200/50 dark:border-orange-800/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                      <Mail className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h3 className="font-semibold text-orange-900 dark:text-orange-100">Email Support</h3>
                  </div>
                  <p className="text-sm text-orange-800/80 dark:text-orange-200/80 mb-2">
                    Send us an email at:
                  </p>
                  <a
                    href="mailto:support@scamdunk.com"
                    className="text-orange-700 dark:text-orange-300 font-medium hover:underline flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    support@scamdunk.com
                  </a>
                  <p className="text-xs text-orange-600/60 dark:text-orange-400/60 mt-2">
                    Or use the form for faster routing and tracking.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      document.getElementById("contact-form")?.scrollIntoView({ behavior: "smooth" });
                      document.getElementById("name")?.focus({ preventScroll: true });
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 text-sm font-medium hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Go to Form
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
