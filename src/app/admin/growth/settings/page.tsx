"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Settings,
  Save,
  RefreshCw,
  Plus,
  X,
} from "lucide-react";

interface GrowthConfig {
  redditSubreddits: string[];
  redditSearchTerms: string[];
  xSearchTerms: string[];
  xHashtags: string[];
  discoveryIntervalHours: number;
  monitoringIntervalHours: number;
  maxDailyDiscoveries: number;
  maxDailyPosts: number;
  autoPostX: boolean;
  discoveryEnabled: boolean;
  draftingEnabled: boolean;
  monitoringEnabled: boolean;
}

export default function GrowthSettings() {
  const [config, setConfig] = useState<GrowthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [activeField, setActiveField] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/growth/config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/growth/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (error) {
      console.error("Failed to save config:", error);
    } finally {
      setSaving(false);
    }
  }

  function addToList(field: keyof GrowthConfig) {
    if (!config || !newItem.trim()) return;
    const list = config[field] as string[];
    if (!list.includes(newItem.trim())) {
      setConfig({ ...config, [field]: [...list, newItem.trim()] });
    }
    setNewItem("");
    setActiveField(null);
  }

  function removeFromList(field: keyof GrowthConfig, index: number) {
    if (!config) return;
    const list = [...(config[field] as string[])];
    list.splice(index, 1);
    setConfig({ ...config, [field]: list });
  }

  if (loading || !config) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  const listFields = [
    { key: "redditSubreddits" as const, label: "Reddit Subreddits", placeholder: "e.g., stocks" },
    { key: "redditSearchTerms" as const, label: "Reddit Search Terms", placeholder: "e.g., is this a scam" },
    { key: "xSearchTerms" as const, label: "X Search Terms", placeholder: "e.g., stock scam" },
    { key: "xHashtags" as const, label: "X Hashtags", placeholder: "e.g., #stockscam" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Growth Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure discovery targets, scheduling, and automation
            </p>
          </div>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium gradient-brand text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Feature Toggles */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Agent Controls</h2>
          {[
            { key: "discoveryEnabled" as const, label: "Discovery Agent", desc: "Find relevant posts on Reddit and X" },
            { key: "draftingEnabled" as const, label: "Drafting Agent", desc: "Auto-generate reply drafts" },
            { key: "monitoringEnabled" as const, label: "Monitoring Agent", desc: "Track engagement on posted replies" },
            { key: "autoPostX" as const, label: "Auto-post to X", desc: "Automatically post approved X replies" },
          ].map((toggle) => (
            <div key={toggle.key} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{toggle.label}</div>
                <div className="text-xs text-muted-foreground">{toggle.desc}</div>
              </div>
              <button
                onClick={() => setConfig({ ...config, [toggle.key]: !config[toggle.key] })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  config[toggle.key] ? "bg-primary" : "bg-secondary"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    config[toggle.key] ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Scheduling */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Scheduling</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "discoveryIntervalHours" as const, label: "Discovery interval (hours)" },
              { key: "monitoringIntervalHours" as const, label: "Monitoring interval (hours)" },
              { key: "maxDailyDiscoveries" as const, label: "Max daily discoveries" },
              { key: "maxDailyPosts" as const, label: "Max daily posts" },
            ].map((field) => (
              <div key={field.key}>
                <label className="text-xs text-muted-foreground">{field.label}</label>
                <input
                  type="number"
                  value={config[field.key]}
                  onChange={(e) =>
                    setConfig({ ...config, [field.key]: parseInt(e.target.value) || 0 })
                  }
                  className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            ))}
          </div>
        </div>

        {/* List Fields */}
        {listFields.map((field) => (
          <div key={field.key} className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">{field.label}</h2>
              <button
                onClick={() => setActiveField(activeField === field.key ? null : field.key)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            {activeField === field.key && (
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addToList(field.key)}
                  placeholder={field.placeholder}
                  className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
                <button
                  onClick={() => addToList(field.key)}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md"
                >
                  Add
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(config[field.key] as string[]).map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-secondary rounded-full text-foreground"
                >
                  {item}
                  <button
                    onClick={() => removeFromList(field.key, idx)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
