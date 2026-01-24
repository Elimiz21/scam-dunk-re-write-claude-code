"use client";

import { useState } from "react";

export default function DebugLoginPage() {
  const [email, setEmail] = useState("elimizroch@gmail.com");
  const [password, setPassword] = useState("AdminPassword123!");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/admin/auth/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult("Error: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Debug Admin Login</h1>
        <p className="text-sm text-gray-500 mb-6">
          This page tests the login flow step-by-step to identify the issue.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <button
            onClick={handleTest}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Testing..." : "Test Login Flow"}
          </button>
        </div>

        {result && (
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
            <pre className="text-sm whitespace-pre-wrap">{result}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
