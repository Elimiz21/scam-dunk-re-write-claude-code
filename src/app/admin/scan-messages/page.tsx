"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AlertBanner from "@/components/admin/AlertBanner";
import {
  MessageSquare,
  Plus,
  Sparkles,
  History,
  GripVertical,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Undo2,
  Database,
} from "lucide-react";

interface ScanMessage {
  id: string;
  headline: string;
  subtext: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  generationId?: string;
}

interface HistoryMessage {
  id: string;
  headline: string;
  subtext: string;
  archiveReason: string;
  originalCreatedAt: string;
  archivedAt: string;
}

interface GeneratedMessage {
  headline: string;
  subtext: string;
  accepted: boolean;
  reason?: string;
}

export default function ScanMessagesPage() {
  const [messages, setMessages] = useState<ScanMessage[]>([]);
  const [historyMessages, setHistoryMessages] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [daysSinceRegeneration, setDaysSinceRegeneration] = useState<number | null>(null);
  const [lastGenerationDate, setLastGenerationDate] = useState<string | null>(null);

  // UI state
  const [showHistory, setShowHistory] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeadline, setEditHeadline] = useState("");
  const [editSubtext, setEditSubtext] = useState("");

  // New message form
  const [newHeadline, setNewHeadline] = useState("");
  const [newSubtext, setNewSubtext] = useState("");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedMessages, setGeneratedMessages] = useState<GeneratedMessage[]>([]);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Seed state
  const [seeding, setSeeding] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scan-messages");
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      setMessages(data.messages);
      setDaysSinceRegeneration(data.daysSinceRegeneration);
      setLastGenerationDate(data.lastGenerationDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/admin/scan-messages/history");
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setHistoryMessages(data.messages);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (showHistory) {
      fetchHistory();
    }
  }, [showHistory]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleAddMessage = async () => {
    if (!newHeadline.trim() || !newSubtext.trim()) return;

    try {
      const res = await fetch("/api/admin/scan-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: newHeadline, subtext: newSubtext }),
      });

      if (!res.ok) throw new Error("Failed to add message");

      setNewHeadline("");
      setNewSubtext("");
      setShowAddForm(false);
      setSuccess("Message added successfully");
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add message");
    }
  };

  const handleUpdateMessage = async (id: string) => {
    try {
      const res = await fetch("/api/admin/scan-messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, headline: editHeadline, subtext: editSubtext }),
      });

      if (!res.ok) throw new Error("Failed to update message");

      setEditingId(null);
      setSuccess("Message updated successfully");
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update message");
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!confirm("Are you sure you want to remove this message?")) return;

    try {
      const res = await fetch(`/api/admin/scan-messages?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete message");

      setSuccess("Message removed and archived");
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete message");
    }
  };

  const handleRestoreMessage = async (historyId: string) => {
    try {
      const res = await fetch("/api/admin/scan-messages/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId }),
      });

      if (!res.ok) throw new Error("Failed to restore message");

      setSuccess("Message restored successfully");
      fetchMessages();
      fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore message");
    }
  };

  const handleGenerateMessages = async () => {
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/admin/scan-messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 15 }),
      });

      if (!res.ok) throw new Error("Failed to generate messages");

      const data = await res.json();
      setGeneratedMessages(
        data.messages.map((m: { headline: string; subtext: string }) => ({
          ...m,
          accepted: true, // Default to accepted
          reason: "",
        }))
      );
      setGenerationId(data.generationId);
      setShowReviewPanel(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate messages");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleAccept = (index: number) => {
    setGeneratedMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, accepted: !m.accepted } : m))
    );
  };

  const handleSetRejectionReason = (index: number, reason: string) => {
    setGeneratedMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, reason } : m))
    );
  };

  const handleSubmitReview = async () => {
    if (!generationId) return;

    try {
      const res = await fetch("/api/admin/scan-messages/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          messages: generatedMessages,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit review");

      const data = await res.json();
      setSuccess(`Added ${data.accepted} messages, rejected ${data.rejected}`);
      setShowReviewPanel(false);
      setGeneratedMessages([]);
      setGenerationId(null);
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = messages.findIndex((m) => m.id === draggedId);
    const targetIndex = messages.findIndex((m) => m.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder locally first for instant feedback
    const newMessages = [...messages];
    const [removed] = newMessages.splice(draggedIndex, 1);
    newMessages.splice(targetIndex, 0, removed);
    setMessages(newMessages);

    // Save to server
    try {
      const res = await fetch("/api/admin/scan-messages/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: newMessages.map((m) => m.id) }),
      });

      if (!res.ok) throw new Error("Failed to save order");
      setSuccess("Order updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save order");
      fetchMessages(); // Revert on error
    }

    setDraggedId(null);
  };

  const startEditing = (message: ScanMessage) => {
    setEditingId(message.id);
    setEditHeadline(message.headline);
    setEditSubtext(message.subtext);
  };

  const handleSeedDefaults = async () => {
    if (!confirm("This will add all default taglines to the database. Continue?")) return;

    setSeeding(true);
    setError("");

    try {
      const res = await fetch("/api/admin/scan-messages/seed", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to seed messages");
      }

      setSuccess(`Successfully added ${data.count} default messages`);
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed messages");
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-secondary rounded w-1/4" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-secondary rounded" />
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              Scan Messages
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the rotating messages shown during scans
            </p>
          </div>

          {/* Days since regeneration badge */}
          {daysSinceRegeneration !== null && (
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl ${
                daysSinceRegeneration > 30
                  ? "bg-red-100 text-red-800"
                  : daysSinceRegeneration > 14
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-green-100 text-green-800"
              }`}
            >
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">
                {daysSinceRegeneration === 0
                  ? "Generated today"
                  : `${daysSinceRegeneration} day${daysSinceRegeneration !== 1 ? "s" : ""} since last generation`}
              </span>
            </div>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <AlertBanner type="error" title="Error" message={error} onDismiss={() => setError("")} />
        )}
        {success && (
          <AlertBanner type="success" title="Success" message={success} />
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-2xl hover:bg-secondary transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Message
          </button>
          <button
            onClick={handleGenerateMessages}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 gradient-brand text-white rounded-2xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? "Generating..." : "Generate 15 with AI"}
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-2xl hover:bg-secondary transition-colors"
          >
            <History className="h-4 w-4" />
            {showHistory ? "Hide" : "Show"} History
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Add New Message Form */}
        {showAddForm && (
          <div className="bg-card rounded-2xl shadow p-6 border-2 border-primary/20">
            <h3 className="text-lg font-medium mb-4">Add New Message</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Headline
                </label>
                <input
                  type="text"
                  value={newHeadline}
                  onChange={(e) => setNewHeadline(e.target.value)}
                  placeholder="e.g., Let's find the scam before it finds you."
                  className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                  maxLength={100}
                />
                <p className="mt-1 text-xs text-muted-foreground">{newHeadline.length}/100 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Subtext
                </label>
                <input
                  type="text"
                  value={newSubtext}
                  onChange={(e) => setNewSubtext(e.target.value)}
                  placeholder="e.g., Enter a ticker to check for red flags"
                  className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                  maxLength={80}
                />
                <p className="mt-1 text-xs text-muted-foreground">{newSubtext.length}/80 characters</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddMessage}
                  disabled={!newHeadline.trim() || !newSubtext.trim()}
                  className="px-4 py-2 gradient-brand text-white rounded-2xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add Message
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewHeadline("");
                    setNewSubtext("");
                  }}
                  className="px-4 py-2 border border-border rounded-2xl hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Generation Review Panel */}
        {showReviewPanel && generatedMessages.length > 0 && (
          <div className="bg-gradient-to-r from-primary/5 to-purple-50 rounded-2xl shadow-lg p-6 border-2 border-primary/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Review Generated Messages
              </h3>
              <span className="text-sm text-muted-foreground">
                {generatedMessages.filter((m) => m.accepted).length} of {generatedMessages.length} selected
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Click to toggle selection. Rejected messages will be used as feedback for future generations.
            </p>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {generatedMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                    msg.accepted
                      ? "bg-card border-green-300 hover:border-green-400"
                      : "bg-secondary/50 border-red-200 hover:border-red-300"
                  }`}
                  onClick={() => handleToggleAccept(index)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{msg.headline}</p>
                      <p className="text-sm text-muted-foreground mt-1">{msg.subtext}</p>
                    </div>
                    <div
                      className={`ml-4 p-2 rounded-full ${
                        msg.accepted ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                      }`}
                    >
                      {msg.accepted ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                    </div>
                  </div>
                  {!msg.accepted && (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={msg.reason || ""}
                        onChange={(e) => handleSetRejectionReason(index, e.target.value)}
                        placeholder="Why was this rejected? (optional, helps improve future generations)"
                        className="w-full px-3 py-2 text-sm border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSubmitReview}
                className="px-6 py-2 gradient-brand text-white rounded-2xl hover:opacity-90 transition-colors"
              >
                Save Selected ({generatedMessages.filter((m) => m.accepted).length})
              </button>
              <button
                onClick={() => {
                  setShowReviewPanel(false);
                  setGeneratedMessages([]);
                  setGenerationId(null);
                }}
                className="px-6 py-2 border border-border rounded-2xl hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Active Messages List */}
        <div className="bg-card rounded-2xl shadow">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-medium text-foreground">
              Active Messages ({messages.length})
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Drag and drop to reorder. These messages rotate during scans.
            </p>
          </div>
          <div className="divide-y divide-border">
            {messages.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground mb-4">
                  No messages yet. Add some, generate with AI, or seed with defaults.
                </p>
                <button
                  onClick={handleSeedDefaults}
                  disabled={seeding}
                  className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-2xl hover:bg-secondary disabled:opacity-50 transition-colors mx-auto"
                >
                  <Database className="h-4 w-4" />
                  {seeding ? "Loading..." : "Load Default Messages"}
                </button>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  draggable={editingId !== message.id}
                  onDragStart={(e) => handleDragStart(e, message.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, message.id)}
                  className={`p-4 flex items-center gap-4 transition-colors ${
                    draggedId === message.id
                      ? "bg-primary/5 opacity-50"
                      : "hover:bg-secondary"
                  }`}
                >
                  <div className="cursor-grab text-muted-foreground hover:text-muted-foreground">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                    {message.order + 1}
                  </div>

                  {editingId === message.id ? (
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={editHeadline}
                        onChange={(e) => setEditHeadline(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                      <input
                        type="text"
                        value={editSubtext}
                        onChange={(e) => setEditSubtext(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateMessage(message.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 border border-border rounded hover:bg-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {message.headline}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{message.subtext}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditing(message)}
                          className="p-2 text-muted-foreground hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          className="p-2 text-muted-foreground hover:text-red-600 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="bg-card rounded-2xl shadow">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                Message History ({historyMessages.length})
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Previously removed or rejected messages. Click restore to bring one back.
              </p>
            </div>
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {historyMessages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No historical messages yet.
                </div>
              ) : (
                historyMessages.map((message) => (
                  <div key={message.id} className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{message.headline}</p>
                      <p className="text-sm text-muted-foreground">{message.subtext}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {message.archiveReason === "DISCARDED"
                          ? "Rejected during review"
                          : message.archiveReason === "MANUAL_REMOVE"
                          ? "Manually removed"
                          : "Replaced"}{" "}
                        on {new Date(message.archivedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestoreMessage(message.id)}
                      className="flex items-center gap-1 px-3 py-1 text-sm border border-border rounded-2xl hover:bg-secondary transition-colors"
                    >
                      <Undo2 className="h-3 w-3" />
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Info panel */}
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">How this works</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • <strong>Active messages</strong> rotate on the home page and during scans
            </li>
            <li>
              • <strong>Drag and drop</strong> to change the display order
            </li>
            <li>
              • <strong>Generate with AI</strong> creates 15 new messages using GPT-4
            </li>
            <li>
              • <strong>Rejected messages</strong> help improve future AI generations
            </li>
            <li>
              • The <strong>timer</strong> shows how long since new content was added
            </li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
