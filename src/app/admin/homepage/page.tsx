"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  Home,
  Plus,
  Sparkles,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  Star,
  Eye,
  Type,
} from "lucide-react";

interface HomepageHero {
  id: string;
  headline: string;
  subheadline: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

interface AiSuggestion {
  headline: string;
  subheadline: string;
}

export default function HomepagePage() {
  const [heroes, setHeroes] = useState<HomepageHero[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeadline, setEditHeadline] = useState("");
  const [editSubheadline, setEditSubheadline] = useState("");

  // New hero form
  const [newHeadline, setNewHeadline] = useState("");
  const [newSubheadline, setNewSubheadline] = useState("");

  // AI generation
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchHeroes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/homepage");
      if (!res.ok) throw new Error("Failed to fetch homepage content");
      const data = await res.json();
      setHeroes(data.heroes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHeroes();
  }, [fetchHeroes]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleAddHero = async () => {
    if (!newHeadline.trim() || !newSubheadline.trim()) return;

    try {
      const res = await fetch("/api/admin/homepage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: newHeadline,
          subheadline: newSubheadline,
        }),
      });

      if (!res.ok) throw new Error("Failed to add headline");

      setNewHeadline("");
      setNewSubheadline("");
      setShowAddForm(false);
      setSuccess("Headline added successfully");
      fetchHeroes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add headline");
    }
  };

  const handleUpdateHero = async (id: string) => {
    try {
      const res = await fetch("/api/admin/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          headline: editHeadline,
          subheadline: editSubheadline,
        }),
      });

      if (!res.ok) throw new Error("Failed to update headline");

      setEditingId(null);
      setSuccess("Headline updated successfully");
      fetchHeroes();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update headline"
      );
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      const res = await fetch("/api/admin/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, setActive: true }),
      });

      if (!res.ok) throw new Error("Failed to activate headline");

      setSuccess("Headline set as active on landing page");
      fetchHeroes();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to activate headline"
      );
    }
  };

  const handleDeleteHero = async (id: string) => {
    if (!confirm("Are you sure you want to delete this headline?")) return;

    try {
      const res = await fetch(`/api/admin/homepage?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete headline");

      setSuccess("Headline deleted");
      fetchHeroes();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete headline"
      );
    }
  };

  const startEditing = (hero: HomepageHero) => {
    setEditingId(hero.id);
    setEditHeadline(hero.headline);
    setEditSubheadline(hero.subheadline);
  };

  const handleGenerateSuggestions = async () => {
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/admin/homepage/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });

      if (!res.ok) throw new Error("Failed to generate suggestions");

      const data = await res.json();
      setSuggestions(data.suggestions);
      setShowSuggestions(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate suggestions"
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleAcceptSuggestion = async (suggestion: AiSuggestion) => {
    try {
      const res = await fetch("/api/admin/homepage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: suggestion.headline,
          subheadline: suggestion.subheadline,
        }),
      });

      if (!res.ok) throw new Error("Failed to save suggestion");

      setSuccess("AI suggestion saved as new headline option");
      fetchHeroes();
      // Remove from suggestions list
      setSuggestions((prev) =>
        prev.filter(
          (s) =>
            s.headline !== suggestion.headline ||
            s.subheadline !== suggestion.subheadline
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save suggestion"
      );
    }
  };

  const activeHero = heroes.find((h) => h.isActive);

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-secondary rounded-2xl w-1/4" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-secondary rounded-2xl" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Home className="h-6 w-6 text-primary" />
            Landing Page Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the hero headline and description shown to visitors on the
            landing page
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <AlertBanner
            type="error"
            title="Error"
            message={error}
            onDismiss={() => setError("")}
          />
        )}
        {success && (
          <AlertBanner type="success" title="Success" message={success} />
        )}

        {/* Current Active Hero Preview */}
        <div className="gradient-brand-subtle rounded-2xl shadow-md p-6 border-2 border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Current Landing Page Preview
            </h3>
            {activeHero && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 text-xs font-medium">
                <Star className="h-3 w-3" />
                Active
              </span>
            )}
          </div>
          <div className="bg-card rounded-2xl p-6 border border-border">
            <h2 className="text-2xl font-bold text-foreground mb-2 font-display italic">
              {activeHero?.headline ||
                "Don't invest blind. Detect scams before they cost you."}
            </h2>
            <p className="text-muted-foreground">
              {activeHero?.subheadline ||
                "Enter any stock or crypto ticker and get an instant risk analysis. We scan for pump-and-dump patterns, manipulation signals, and regulatory red flags in seconds."}
            </p>
            {!activeHero && (
              <p className="text-xs text-amber-500 mt-3 flex items-center gap-1">
                <Type className="h-3 w-3" />
                Using default content. Create and activate a headline below to
                customize.
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-2xl hover:bg-secondary transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Headline
          </button>
          <button
            onClick={handleGenerateSuggestions}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 gradient-brand text-white rounded-2xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating
              ? "Generating..."
              : "Generate AI Recommendations"}
          </button>
        </div>

        {/* Add New Hero Form */}
        {showAddForm && (
          <div className="bg-card rounded-2xl shadow p-6 border-2 border-primary/20">
            <h3 className="text-lg font-medium mb-4">Add New Headline</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Headline
                </label>
                <input
                  type="text"
                  value={newHeadline}
                  onChange={(e) => setNewHeadline(e.target.value)}
                  placeholder='e.g., Don&apos;t invest blind. Detect scams before they cost you.'
                  className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                  maxLength={120}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {newHeadline.length}/120 characters
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Subheadline / Description
                </label>
                <textarea
                  value={newSubheadline}
                  onChange={(e) => setNewSubheadline(e.target.value)}
                  placeholder="e.g., Enter any stock or crypto ticker and get an instant risk analysis..."
                  className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={3}
                  maxLength={200}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {newSubheadline.length}/200 characters
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddHero}
                  disabled={!newHeadline.trim() || !newSubheadline.trim()}
                  className="px-4 py-2 gradient-brand text-white rounded-2xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add Headline
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewHeadline("");
                    setNewSubheadline("");
                  }}
                  className="px-4 py-2 border border-border rounded-2xl hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Suggestions Review Panel */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="gradient-brand-subtle rounded-2xl shadow-md p-6 border-2 border-primary/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Recommendations
              </h3>
              <button
                onClick={() => {
                  setShowSuggestions(false);
                  setSuggestions([]);
                }}
                className="p-1 hover:bg-secondary rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Click &quot;Use This&quot; to save a suggestion as a headline
              option, then activate it to show on the landing page.
            </p>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="p-4 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors"
                >
                  <p className="font-bold text-foreground text-lg font-display italic mb-1">
                    {suggestion.headline}
                  </p>
                  <p className="text-sm text-muted-foreground mb-3">
                    {suggestion.subheadline}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptSuggestion(suggestion)}
                      className="flex items-center gap-1 px-3 py-1.5 gradient-brand text-white text-sm rounded-2xl hover:opacity-90 transition-colors"
                    >
                      <Check className="h-3 w-3" />
                      Use This
                    </button>
                    <button
                      onClick={() => {
                        setNewHeadline(suggestion.headline);
                        setNewSubheadline(suggestion.subheadline);
                        setShowAddForm(true);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 border border-border text-sm rounded-2xl hover:bg-secondary transition-colors"
                    >
                      <Edit2 className="h-3 w-3" />
                      Edit First
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleGenerateSuggestions}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-2xl hover:bg-secondary disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`h-4 w-4 ${generating ? "animate-spin" : ""}`}
                />
                Generate More
              </button>
            </div>
          </div>
        )}

        {/* All Headlines List */}
        <div className="bg-card rounded-2xl shadow">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-medium text-foreground">
              All Headlines ({heroes.length})
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Click &quot;Set Active&quot; to make a headline live on the
              landing page. Only one can be active at a time.
            </p>
          </div>
          <div className="divide-y divide-border">
            {heroes.length === 0 ? (
              <div className="p-8 text-center">
                <Type className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">
                  No custom headlines yet.
                </p>
                <p className="text-sm text-muted-foreground">
                  The default headline is being used. Add a new one or generate
                  AI recommendations to customize.
                </p>
              </div>
            ) : (
              heroes.map((hero) => (
                <div
                  key={hero.id}
                  className={`p-5 transition-colors ${
                    hero.isActive
                      ? "bg-emerald-500/10 border-l-4 border-emerald-500"
                      : "hover:bg-secondary"
                  }`}
                >
                  {editingId === hero.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Headline
                        </label>
                        <input
                          type="text"
                          value={editHeadline}
                          onChange={(e) => setEditHeadline(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                          maxLength={120}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Subheadline
                        </label>
                        <textarea
                          value={editSubheadline}
                          onChange={(e) => setEditSubheadline(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                          rows={2}
                          maxLength={200}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateHero(hero.id)}
                          className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 border border-border rounded hover:bg-secondary text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {hero.isActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 text-xs font-medium">
                              <Star className="h-3 w-3" />
                              Active
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(hero.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="font-bold text-foreground text-lg font-display italic">
                          {hero.headline}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {hero.subheadline}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!hero.isActive && (
                          <button
                            onClick={() => handleSetActive(hero.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-2xl hover:bg-emerald-700 transition-colors"
                          >
                            <Star className="h-3 w-3" />
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => startEditing(hero)}
                          className="p-2 text-muted-foreground hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteHero(hero.id)}
                          className="p-2 text-muted-foreground hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
          <h4 className="font-medium text-primary mb-2">How this works</h4>
          <ul className="text-sm text-primary/90 space-y-1">
            <li>
              • <strong>Headlines</strong> are the main hero text shown to
              visitors on the landing page before they sign up
            </li>
            <li>
              • <strong>Only one</strong> headline can be active at a time —
              click &quot;Set Active&quot; to switch
            </li>
            <li>
              • <strong>Generate with AI</strong> creates 5 different headline
              options using GPT-4
            </li>
            <li>
              • If no headline is active, the{" "}
              <strong>default content</strong> is shown automatically
            </li>
            <li>
              • Changes take effect{" "}
              <strong>immediately</strong> on the live landing page
            </li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
