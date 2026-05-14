"use client";

import {
  rememberDevice,
  sendTwoFactorOtp,
  verifyTotp,
  verifyTwoFactorOtp,
} from "@/lib/authApi";
import { useEffect, useRef, useState } from "react";

function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [local, domain] = email.split("@");
  return local.slice(0, 2) + "***@" + domain;
}

function getStoredPendingUser() {
  try {
    const raw =
      sessionStorage.getItem("pmp_pending_user") ||
      localStorage.getItem("auth_user") ||
      sessionStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Shared layout wrappers ──────────────────────────────────────────────────
const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.78)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
};

const cardStyle = {
  maxWidth: "460px",
  width: "100%",
  background: "var(--dark2, #161616)",
  borderRadius: "18px",
  border: "1px solid var(--border, rgba(255,255,255,0.07))",
  padding: "40px 32px",
  textAlign: "center",
};

const lockIcon = (
  <svg
    width="44"
    height="44"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--gold, #d4a843)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginBottom: "16px" }}
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// ── Method Selector Screen ──────────────────────────────────────────────────
function MethodSelector({ onSelect, onBack }) {
  const [chosen, setChosen] = useState(null);

  const methods = [
    {
      key: "email",
      label: "Email OTP",
      desc: "A 6-digit code is sent to your registered email address.",
      accentColor: "#60a5fa",
      bgColor: "rgba(96,165,250,0.07)",
      borderColor: (active) => active ? "rgba(96,165,250,0.7)" : "rgba(255,255,255,0.09)",
      icon: (active) => (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke={active ? "#60a5fa" : "rgba(255,255,255,0.35)"} strokeWidth="1.8">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      ),
      badge: "Recommended",
      badgeColor: "#60a5fa",
    },
    {
      key: "totp",
      label: "Authenticator App",
      desc: "Open Google Authenticator or Authy and enter your code. Works offline.",
      accentColor: "#4ade80",
      bgColor: "rgba(74,222,128,0.07)",
      borderColor: (active) => active ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.09)",
      icon: (active) => (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke={active ? "#4ade80" : "rgba(255,255,255,0.35)"} strokeWidth="1.8">
          <rect x="5" y="2" width="14" height="20" rx="2"/>
          <path d="M9 7h6M9 11h6M9 15h4"/>
          <circle cx="15" cy="15" r="0.5" fill={active ? "#4ade80" : "rgba(255,255,255,0.35)"}/>
        </svg>
      ),
      badge: "More secure",
      badgeColor: "#4ade80",
    },
  ];

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {lockIcon}
        <h1 style={{ margin: "0 0 6px", fontSize: "21px", fontWeight: 700, color: "var(--white, #f5f5f5)" }}>
          Two-Factor Authentication
        </h1>
        <p style={{ margin: "0 0 28px", fontSize: "13px", color: "var(--gray, #888)", lineHeight: 1.5 }}>
          Choose how you want to verify your identity.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
          {methods.map((m) => {
            const active = chosen === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setChosen(m.key)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  padding: "16px 18px",
                  borderRadius: "12px",
                  border: `2px solid ${m.borderColor(active)}`,
                  background: active ? m.bgColor : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.18s",
                  outline: "none",
                }}
              >
                <div style={{
                  flexShrink: 0,
                  width: "46px",
                  height: "46px",
                  borderRadius: "10px",
                  background: active ? m.bgColor : "rgba(255,255,255,0.04)",
                  border: `1px solid ${m.borderColor(active)}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {m.icon(active)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: active ? m.accentColor : "var(--white, #f5f5f5)" }}>
                      {m.label}
                    </span>
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "999px",
                      background: `${m.badgeColor}18`,
                      color: m.badgeColor,
                      border: `1px solid ${m.badgeColor}35`,
                      letterSpacing: "0.04em",
                    }}>
                      {m.badge}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--gray, #888)", lineHeight: 1.45 }}>
                    {m.desc}
                  </p>
                </div>
                {/* Radio indicator */}
                <div style={{
                  flexShrink: 0,
                  marginTop: "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: `2px solid ${active ? m.accentColor : "rgba(255,255,255,0.2)"}`,
                  background: active ? m.accentColor : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s",
                }}>
                  {active && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#000" }}/>}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => chosen && onSelect(chosen)}
          disabled={!chosen}
          style={{
            width: "100%",
            height: "48px",
            background: chosen ? "var(--gold, #d4a843)" : "rgba(255,255,255,0.07)",
            color: chosen ? "var(--dark, #0f0f0f)" : "var(--gray, #555)",
            fontWeight: 700,
            fontSize: "15px",
            border: "none",
            borderRadius: "10px",
            cursor: chosen ? "pointer" : "not-allowed",
            transition: "all 0.18s",
          }}
        >
          Continue
        </button>

        <button
          onClick={onBack}
          style={{
            marginTop: "14px",
            background: "none",
            border: "none",
            color: "var(--gray, #888)",
            fontSize: "13px",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Cancel login
        </button>
      </div>
    </div>
  );
}

// ── Code Entry Screen ───────────────────────────────────────────────────────
function CodeEntry({ token, method, userEmail, persistLogin, onSuccess, onBack, onSwitchMethod }) {
  const inputRefs = useRef([]);
  const hasSentInitial = useRef(false);
  const isTOTP = method === "totp";

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remember, setRemember] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);

  // Auto-send email OTP on mount
  useEffect(() => {
    if (!token || hasSentInitial.current || isTOTP) return;
    hasSentInitial.current = true;
    handleSendOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown (email only)
  useEffect(() => {
    if (isTOTP) return;
    if (countdown <= 0) { setCanResend(true); return; }
    setCanResend(false);
    const t = setInterval(() => {
      setCountdown((p) => {
        if (p <= 1) { clearInterval(t); setCanResend(true); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [countdown, isTOTP]);

  const handleSendOtp = async () => {
    setSending(true); setError(null);
    try {
      await sendTwoFactorOtp(token);
      setCountdown(30); setCanResend(false);
    } catch (err) {
      if (err.status === 423) { setIsLocked(true); setLockedUntil(err.lockedUntil || "10 minutes"); }
      else if (err.status === 429) { setCountdown(Math.min(err.retryAfter ?? 30, 30)); setCanResend(false); }
      else setError(err.message || "Failed to send OTP");
    } finally { setSending(false); }
  };

  const handleInputChange = (idx, val) => {
    if (val && !/^\d$/.test(val)) return;
    const next = [...digits]; next[idx] = val; setDigits(next);
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
      const next = [...digits]; next[idx - 1] = ""; setDigits(next);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerify = async () => {
    if (!token) return;
    const code = digits.join("");
    if (code.length !== 6 || loading || sending || isLocked) return;
    setLoading(true); setError(null);
    try {
      const result = isTOTP
        ? await verifyTotp(token, code)
        : await verifyTwoFactorOtp(token, { code });

      if (result.verified) {
        if (remember) {
          try {
            const dr = await rememberDevice(token);
            if (dr.device_token) {
              const storage = persistLogin ? localStorage : sessionStorage;
              storage.setItem("device_token", dr.device_token);
            }
          } catch { /* non-fatal */ }
        }
        const redirectTo = sessionStorage.getItem("post_2fa_redirect") || "/shop";
        sessionStorage.removeItem("pending_2fa");
        sessionStorage.removeItem("post_2fa_redirect");
        onSuccess(redirectTo);
      }
    } catch (err) {
      if (err.status === 423) { setIsLocked(true); setLockedUntil(err.lockedUntil || "10 minutes"); }
      else {
        setError(err.message || "Invalid code. Please try again.");
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (!canResend || isTOTP) return;
    setCanResend(false); setError(null); setIsLocked(false); setLockedUntil(null);
    setDigits(["", "", "", "", "", ""]); inputRefs.current[0]?.focus();
    setSending(true);
    try { await sendTwoFactorOtp(token); setCountdown(30); }
    catch (err) {
      if (err.status === 423) { setIsLocked(true); setLockedUntil(err.lockedUntil || "10 minutes"); }
      else if (err.status === 429) { setCountdown(Math.min(err.retryAfter ?? 30, 30)); }
      else { setError(err.message || "Failed to resend OTP"); setCanResend(true); }
    } finally { setSending(false); }
  };

  const isEmail = method === "email";
  const accent = isEmail ? "#60a5fa" : "#4ade80";
  const methodIcon = isEmail ? (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ) : (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <path d="M9 7h6M9 11h6M9 15h4"/>
    </svg>
  );

  if (isLocked) {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          {lockIcon}
          <h1 style={{ fontSize: "21px", fontWeight: 700, color: "var(--white, #f5f5f5)", margin: "0 0 12px" }}>
            Account Temporarily Locked
          </h1>
          <p style={{ fontSize: "14px", color: "var(--red, #ef4444)", margin: "0 0 24px", lineHeight: 1.6 }}>
            Too many attempts. Try again after {lockedUntil || "10 minutes"}.
          </p>
          <button onClick={onBack} style={{ width: "100%", height: "48px", background: "var(--gold, #d4a843)", color: "var(--dark, #0f0f0f)", fontWeight: 700, fontSize: "15px", border: "none", borderRadius: "10px", cursor: "pointer" }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isDisabled = loading || sending || digits.join("").length !== 6;

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Method badge */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderRadius: "999px",
            background: `${accent}12`,
            border: `1px solid ${accent}40`,
          }}>
            {methodIcon}
            <span style={{ fontSize: "13px", fontWeight: 700, color: accent }}>
              {isEmail ? "Email OTP" : "Authenticator App"}
            </span>
          </div>
        </div>

        <h1 style={{ margin: "0 0 8px", fontSize: "21px", fontWeight: 700, color: "var(--white, #f5f5f5)" }}>
          Enter Verification Code
        </h1>

        {isEmail ? (
          <p style={{ fontSize: "13px", color: "var(--gray, #888)", margin: "0 0 28px", lineHeight: 1.5 }}>
            {sending ? "Sending code to your email…" : `Code sent to ${maskEmail(userEmail)}`}
          </p>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--gray, #888)", margin: "0 0 28px", lineHeight: 1.5 }}>
            Open your authenticator app and enter the 6-digit code shown.
          </p>
        )}

        {/* Digit inputs */}
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => (inputRefs.current[idx] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInputChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              disabled={loading || sending}
              style={{
                width: "48px",
                height: "56px",
                fontSize: "24px",
                textAlign: "center",
                borderRadius: "10px",
                border: `1.5px solid ${digit ? `${accent}80` : "rgba(255,255,255,0.1)"}`,
                background: digit ? `${accent}0d` : "var(--dark, #1a1a1a)",
                color: "var(--white, #f5f5f5)",
                outline: "none",
                transition: "all 0.15s",
                fontFamily: "monospace",
              }}
              onFocus={(e) => { e.target.style.borderColor = `${accent}80`; }}
              onBlur={(e) => { if (!digit) e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
          ))}
        </div>

        <div style={{ minHeight: "22px", marginBottom: "12px" }}>
          {error && <p style={{ fontSize: "13px", color: "var(--red, #ef4444)", margin: 0 }}>{error}</p>}
        </div>

        <button
          onClick={handleVerify}
          disabled={isDisabled}
          style={{
            width: "100%",
            height: "48px",
            background: isDisabled ? "rgba(255,255,255,0.07)" : accent,
            color: isDisabled ? "var(--gray, #555)" : "#000",
            fontWeight: 700,
            fontSize: "15px",
            border: "none",
            borderRadius: "10px",
            cursor: isDisabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.18s",
          }}
        >
          {loading ? "Verifying…" : sending ? "Sending code…" : "Verify"}
        </button>

        {/* Remember device */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          <input
            type="checkbox"
            id="tfa-remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: "16px", height: "16px", accentColor: accent, cursor: "pointer" }}
          />
          <label htmlFor="tfa-remember" style={{ fontSize: "13px", color: "var(--gray, #888)", cursor: "pointer" }}>
            Remember this device for 90 days
          </label>
        </div>

        {/* Resend (email only) */}
        {!isTOTP && (
          <div style={{ marginTop: "20px", fontSize: "13px", color: "var(--gray, #666)" }}>
            Didn&apos;t receive it?{" "}
            <button
              onClick={handleResend}
              disabled={!canResend}
              style={{
                background: "none", border: "none",
                color: canResend ? accent : "var(--gray, #555)",
                fontSize: "13px", fontWeight: 600,
                cursor: canResend ? "pointer" : "not-allowed",
                textDecoration: canResend ? "underline" : "none",
                padding: 0,
              }}
            >
              {canResend ? "Resend code" : `Resend in ${countdown}s`}
            </button>
          </div>
        )}

        {/* TOTP hint */}
        {isTOTP && (
          <p style={{ marginTop: "16px", fontSize: "12px", color: "var(--gray, #666)", lineHeight: 1.5 }}>
            Code refreshes every 30 seconds. Make sure your device time is correct.
          </p>
        )}

        {/* Switch method (only shown if came from selector) */}
        {onSwitchMethod && (
          <button
            onClick={onSwitchMethod}
            style={{
              marginTop: "18px",
              background: "none", border: "none",
              color: "var(--gray, #888)", fontSize: "12px",
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            Use a different method
          </button>
        )}
      </div>

      <style>{`@keyframes spin2fa { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function TwoFactorModal({ token, userEmail, onSuccess, onBack, persistLogin = false }) {
  const storedUser = getStoredPendingUser();
  const totpConfirmed = storedUser?.totp_confirmed === true;

  // If TOTP is set up → let user choose; otherwise go straight to email
  const [step, setStep] = useState(totpConfirmed ? "select" : "email");
  const [chosenMethod, setChosenMethod] = useState(totpConfirmed ? null : "email");

  const handleSelectMethod = (method) => {
    setChosenMethod(method);
    setStep(method); // "email" or "totp"
  };

  const handleBack = () => {
    sessionStorage.removeItem("pmp_pending_token");
    sessionStorage.removeItem("pmp_pending_user");
    sessionStorage.removeItem("pmp_pending_remember");
    sessionStorage.removeItem("pending_2fa");
    sessionStorage.removeItem("post_2fa_redirect");
    onBack();
  };

  if (step === "select") {
    return <MethodSelector onSelect={handleSelectMethod} onBack={handleBack} />;
  }

  return (
    <CodeEntry
      token={token}
      method={chosenMethod || "email"}
      userEmail={userEmail}
      persistLogin={persistLogin}
      onSuccess={onSuccess}
      onBack={handleBack}
      onSwitchMethod={totpConfirmed ? () => setStep("select") : null}
    />
  );
}
