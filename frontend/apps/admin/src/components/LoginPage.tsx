import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { adminApi } from "../lib/api";
import { clearToken, setToken } from "../lib/auth";
import { AdminStatsSchema } from "@monysa/contracts";

export function LoginPage() {
  const navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!secret.trim()) return;
    setLoading(true);
    setError(null);
    // Temporarily set token to test it against a real endpoint.
    setToken(secret.trim());
    try {
      await adminApi.get("/api/admin/stats", AdminStatsSchema);
      await navigate({ to: "/dashboard" });
    } catch {
      clearToken();
      setError("Invalid admin secret — authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div>
          <div className="login-title">MONY<span>SA</span> ADMIN</div>
          <div className="login-subtitle" style={{ marginTop: 4 }}>Enter your admin secret to continue.</div>
        </div>
        <div className="login-field">
          <label className="login-label" htmlFor="secret">Admin Secret</label>
          <input
            id="secret"
            type="password"
            className="login-input"
            placeholder="Bearer token…"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={loading || !secret.trim()}>
          {loading ? "Verifying…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
