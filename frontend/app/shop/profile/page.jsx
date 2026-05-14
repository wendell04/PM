"use client";

import {
  confirmTotp,
  removeTotp,
  setupTotp,
  updateTwoFactorMethod,
} from "@/lib/authApi";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import "../../../components/custom-styles.css";
import AddressBook from "../../../components/profile/AddressBook";
import { useAuth } from "../../../contexts/AuthContext";
import "../shop.css";

const ReadOnlyPinMap = dynamic(
  () => import("@/components/maps/ReadOnlyPinMap"),
  { ssr: false },
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function getLocalUser() {
  try {
    const raw =
      localStorage.getItem("auth_user") || sessionStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function TwoFactorSection({ token, twoFactorEnabled, setTwoFactorEnabled }) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const getStoredTotpConfirmed = () => {
    try {
      const raw = localStorage.getItem("auth_user") || sessionStorage.getItem("auth_user");
      return raw ? !!(JSON.parse(raw)?.totp_confirmed) : false;
    } catch { return false; }
  };

  const [twoFaToggling, setTwoFaToggling] = useState(false);
  const [twoFaError, setTwoFaError]       = useState("");
  const [twoFaSuccess, setTwoFaSuccess]   = useState("");
  const [totpConfirmed, setTotpConfirmed] = useState(getStoredTotpConfirmed);

  // TOTP setup flow states
  const [totpStep, setTotpStep]       = useState("idle"); // idle | setup | confirm | active | remove
  const [qrCode, setQrCode]           = useState("");
  const [totpSecret, setTotpSecret]   = useState("");
  const [totpCode, setTotpCode]       = useState("");
  const [totpError, setTotpError]     = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [removePassword, setRemovePassword] = useState("");
  const [showRemovePass, setShowRemovePass] = useState(false);

  const updateStoredUser = (updates) => {
    try {
      const ss = sessionStorage.getItem("auth_user");
      const ls = localStorage.getItem("auth_user");
      const key = ss ? sessionStorage : localStorage;
      const raw = ss || ls;
      if (raw) {
        const u = JSON.parse(raw);
        Object.assign(u, updates);
        key.setItem("auth_user", JSON.stringify(u));
      }
    } catch {}
  };

  const handleToggle2FA = async () => {
    setTwoFaToggling(true);
    setTwoFaError("");
    setTwoFaSuccess("");
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/2fa/toggle`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
        10000,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update 2FA.");
      const next = !!data.two_factor_enabled;
      setTwoFactorEnabled(next);
      setTwoFaSuccess(
        data.message ||
          (next ? "Two-factor authentication enabled." : "Disabled."),
      );
      setTimeout(() => setTwoFaSuccess(""), 3000);
      updateStoredUser({ two_factor_enabled: next });
      if (!next) setTotpStep("idle");
    } catch (err) {
      setTwoFaError(err.message || "Failed to update 2FA setting.");
    } finally {
      setTwoFaToggling(false);
    }
  };

  const handleSetupTotp = async () => {
    setTotpError(""); setTotpLoading(true);
    try {
      const data = await setupTotp(token);
      setQrCode(data.qr_code);
      setTotpSecret(data.manual_entry?.key || data.secret);
      setTotpStep("setup");
    } catch (err) {
      setTotpError(err.message || "Failed to start setup.");
    } finally { setTotpLoading(false); }
  };

  const handleConfirmTotp = async () => {
    if (totpCode.length !== 6) return;
    setTotpLoading(true);
    setTotpError("");
    try {
      await confirmTotp(token, totpCode);
      setTotpConfirmed(true);
      setTotpStep("active");
      updateStoredUser({ totp_confirmed: true });
    } catch (err) {
      setTotpError(err.message || "Invalid code. Try again.");
    } finally {
      setTotpLoading(false);
    }
  };

  const handleRemoveTotp = async () => {
    if (!removePassword) {
      setTotpError("Password is required.");
      return;
    }
    setTotpLoading(true);
    setTotpError("");
    try {
      await removeTotp(token, removePassword);
      setTotpConfirmed(false);
      setTotpStep("idle");
      setRemovePassword("");
      updateStoredUser({ totp_confirmed: false });
    } catch (err) {
      setTotpError(err.message || "Incorrect password.");
    } finally {
      setTotpLoading(false);
    }
  };

  const s = {
    card: {
      padding: "1rem 1.25rem",
      background: "var(--dark)",
      border: "1px solid var(--border)",
      borderRadius: "10px",
    },
    methodBtn: (active) => ({
      flex: 1,
      padding: "0.875rem 1rem",
      borderRadius: "10px",
      border: `1.5px solid ${active ? "rgba(212,168,67,0.6)" : "var(--border)"}`,
      background: active ? "rgba(212,168,67,0.06)" : "var(--dark)",
      color: "var(--white)",
      cursor: "pointer",
      textAlign: "left",
      transition: "all 0.2s",
    }),
    input: {
      width: "100%",
      padding: "0.625rem 0.75rem",
      background: "var(--dark)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      color: "var(--white)",
      fontSize: "0.875rem",
      boxSizing: "border-box",
      marginTop: "0.5rem",
    },
    btn: (variant = "gold") => ({
      padding: "0.625rem 1.25rem",
      borderRadius: "8px",
      border: "none",
      fontWeight: 600,
      fontSize: "0.875rem",
      cursor: totpLoading ? "not-allowed" : "pointer",
      opacity: totpLoading ? 0.6 : 1,
      background: variant === "gold" ? "var(--gold)" : "rgba(239,68,68,0.12)",
      color: variant === "gold" ? "var(--black)" : "var(--red)",
    }),
  };

  return (
    <div
      style={{
        marginTop: "2rem",
        paddingTop: "1.5rem",
        borderTop: "1px solid var(--border)",
      }}
    >
      {/* ── Toggle ── */}
      <h3
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.9375rem",
          fontWeight: 700,
          color: "var(--white)",
        }}
      >
        Two-factor authentication
      </h3>

      <div
        style={{
          ...s.card,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.2rem 0.6rem",
              borderRadius: "20px",
              fontSize: "0.7rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: twoFactorEnabled
                ? "rgba(74,222,128,0.12)"
                : "rgba(156,163,175,0.12)",
              color: twoFactorEnabled ? "var(--green)" : "var(--gray)",
            }}
          >
            {twoFactorEnabled ? "Enabled" : "Disabled"}
          </span>
          <button
            onClick={handleToggle2FA}
            disabled={twoFaToggling}
            aria-pressed={twoFactorEnabled}
            style={{
              position: "relative",
              width: "44px",
              height: "24px",
              borderRadius: "12px",
              border: "none",
              cursor: twoFaToggling ? "not-allowed" : "pointer",
              background: twoFactorEnabled ? "var(--gold)" : "var(--border)",
              transition: "background 0.2s",
              padding: 0,
              opacity: twoFaToggling ? 0.6 : 1,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: twoFactorEnabled ? "23px" : "3px",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {twoFaError && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "6px",
              color: "var(--red)",
              fontSize: "0.8rem",
            }}
          >
            {twoFaError}
          </div>
        )}
        {twoFaSuccess && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.2)",
              borderRadius: "6px",
              color: "var(--green)",
              fontSize: "0.8rem",
            }}
          >
            {twoFaSuccess}
          </div>
        )}
      </div>

      {/* ── Verification methods — shown when 2FA is enabled ── */}
      {twoFactorEnabled && totpStep !== "setup" && totpStep !== "confirm" && totpStep !== "remove" && (
        <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--gray)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Verification Methods
          </p>

          {/* Email OTP — always available */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.875rem",
            padding: "0.875rem 1rem", borderRadius: "10px",
            border: "1.5px solid rgba(96,165,250,0.35)",
            background: "rgba(96,165,250,0.05)",
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px", flexShrink: 0,
              background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#60a5fa", marginBottom: "0.15rem" }}>Email OTP</div>
              <div style={{ fontSize: "0.73rem", color: "var(--gray)" }}>A 6-digit code sent to your email at each login.</div>
            </div>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)", whiteSpace: "nowrap" }}>
              Always available
            </span>
          </div>

          {/* Authenticator App — setup or active */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.875rem",
            padding: "0.875rem 1rem", borderRadius: "10px",
            border: `1.5px solid ${totpConfirmed ? "rgba(74,222,128,0.45)" : "rgba(255,255,255,0.09)"}`,
            background: totpConfirmed ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.02)",
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px", flexShrink: 0,
              background: totpConfirmed ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${totpConfirmed ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={totpConfirmed ? "#4ade80" : "var(--gray)"} strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2"/>
                <path d="M9 7h6M9 11h6M9 15h4"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: totpConfirmed ? "#4ade80" : "var(--white)", marginBottom: "0.15rem" }}>Authenticator App</div>
              <div style={{ fontSize: "0.73rem", color: "var(--gray)" }}>
                {totpConfirmed ? "Google Authenticator / Authy is linked to your account." : "Link Google Authenticator or Authy for offline codes."}
              </div>
            </div>
            {totpConfirmed ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem", flexShrink: 0 }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                  ACTIVE
                </span>
                <button onClick={() => { setTotpStep("remove"); setTotpError(""); }}
                  style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "var(--red)", cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={handleSetupTotp}
                disabled={totpLoading}
                style={{ fontSize: "0.78rem", fontWeight: 700, padding: "0.4rem 0.9rem", borderRadius: "8px", border: "1px solid rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.1)", color: "#4ade80", cursor: totpLoading ? "not-allowed" : "pointer", flexShrink: 0, opacity: totpLoading ? 0.6 : 1 }}>
                {totpLoading ? "Loading…" : "Set Up"}
              </button>
            )}
          </div>

          {totpError && totpStep === "idle" && (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--red)" }}>{totpError}</p>
          )}

          <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--gray)", lineHeight: 1.4 }}>
            At login you can choose which method to use. Both can be active simultaneously.
          </p>
        </div>
      )}

      {/* ── TOTP Setup — Show QR code ── */}
      {totpStep === "setup" && (
        <div style={{ marginTop: "1.25rem", ...s.card }}>
          <h4
            style={{
              margin: "0 0 1rem",
              color: "var(--white)",
              fontSize: "0.9rem",
            }}
          >
            Scan this QR code with your authenticator app
          </h4>
          {qrCode && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "1rem",
              }}
            >
              <img
                src={qrCode}
                alt="TOTP QR Code"
                style={{
                  width: "180px",
                  height: "180px",
                  borderRadius: "8px",
                  background: "#fff",
                  padding: "8px",
                }}
              />
            </div>
          )}
          <p
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.8rem",
              color: "var(--gray)",
            }}
          >
            Can&apos;t scan? Enter this key manually:
          </p>
          <code
            style={{
              display: "block",
              padding: "0.5rem 0.75rem",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "6px",
              fontSize: "0.85rem",
              color: "var(--gold)",
              letterSpacing: "0.1em",
              wordBreak: "break-all",
              marginBottom: "1.25rem",
            }}
          >
            {totpSecret}
          </code>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={() => setTotpStep("idle")}
              style={{ ...s.btn("red"), flex: 1 }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setTotpStep("confirm");
                setTotpCode("");
                setTotpError("");
              }}
              style={{ ...s.btn("gold"), flex: 1 }}
            >
              I&apos;ve scanned it →
            </button>
          </div>
        </div>
      )}

      {/* ── TOTP Confirm — Enter first code ── */}
      {totpStep === "confirm" && (
        <div style={{ marginTop: "1.25rem", ...s.card }}>
          <h4
            style={{
              margin: "0 0 0.5rem",
              color: "var(--white)",
              fontSize: "0.9rem",
            }}
          >
            Enter the 6-digit code from your app
          </h4>
          <p
            style={{
              margin: "0 0 1rem",
              fontSize: "0.8rem",
              color: "var(--gray)",
            }}
          >
            This confirms the setup worked correctly.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={totpCode}
            onChange={(e) =>
              setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            style={{
              ...s.input,
              textAlign: "center",
              fontSize: "1.5rem",
              letterSpacing: "0.3em",
              fontFamily: "monospace",
            }}
          />
          {totpError && (
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.8rem",
                color: "var(--red)",
              }}
            >
              {totpError}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              onClick={() => setTotpStep("setup")}
              style={{ ...s.btn("red"), flex: 1 }}
            >
              Back
            </button>
            <button
              onClick={handleConfirmTotp}
              disabled={totpLoading || totpCode.length !== 6}
              style={{
                ...s.btn("gold"),
                flex: 1,
                opacity: totpLoading || totpCode.length !== 6 ? 0.6 : 1,
              }}
            >
              {totpLoading ? "Verifying..." : "Confirm Setup"}
            </button>
          </div>
        </div>
      )}

      {/* ── TOTP active confirmation ── */}
      {totpStep === "active" && (
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "8px", color: "var(--green)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          Authenticator app linked! You can now choose it at login.
        </div>
      )}

      {/* ── Remove TOTP — password confirmation ── */}
      {totpStep === "remove" && (
        <div style={{ marginTop: "1.25rem", ...s.card }}>
          <h4
            style={{
              margin: "0 0 0.5rem",
              color: "var(--white)",
              fontSize: "0.9rem",
            }}
          >
            Remove Google Authenticator
          </h4>
          <p
            style={{
              margin: "0 0 1rem",
              fontSize: "0.8rem",
              color: "var(--gray)",
            }}
          >
            Enter your account password to confirm removal. Email OTP will still be available at login.
          </p>
          <div style={{ position: "relative" }}>
            <input
              type={showRemovePass ? "text" : "password"}
              placeholder="Current password"
              value={removePassword}
              onChange={(e) => setRemovePassword(e.target.value)}
              style={{ ...s.input, paddingRight: "2.5rem" }}
            />
            <button
              type="button"
              onClick={() => setShowRemovePass((v) => !v)}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--gray)",
                cursor: "pointer",
                marginTop: "0.25rem",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {showRemovePass ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
          {totpError && (
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.8rem",
                color: "var(--red)",
              }}
            >
              {totpError}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              onClick={() => {
                setTotpStep("idle");
                setRemovePassword("");
                setTotpError("");
              }}
              style={{ ...s.btn("red"), flex: 1 }}
            >
              Cancel
            </button>
            <button
              onClick={handleRemoveTotp}
              disabled={totpLoading || !removePassword}
              style={{
                ...s.btn("gold"),
                flex: 1,
                opacity: totpLoading || !removePassword ? 0.6 : 1,
              }}
            >
              {totpLoading ? "Removing..." : "Confirm Remove"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerProfilePage() {
  const router = useRouter();
  const {
    currentUser,
    updateUser,
    logout,
    isLoading: authLoading,
    token,
  } = useAuth();
  const searchParams = useSearchParams();

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
  });

  // UI State
  const [activeTab, setActiveTab] = useState(
    () => searchParams?.get("tab") || "overview",
  );
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileSnapshot, setProfileSnapshot] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    newPass: false,
    confirm: false,
  });

  // Avatar state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarHover, setAvatarHover] = useState(false);

  // Overview addresses state
  const [overviewAddresses, setOverviewAddresses] = useState([]);
  const [overviewAddrLoading, setOverviewAddrLoading] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [revokingId, setRevokingId] = useState(null);
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);
  const [sessionsSuccess, setSessionsSuccess] = useState("");
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // 2FA toggle state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // Delete account state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteShowPassword, setDeleteShowPassword] = useState(false);

  // Ref to track if tab has mounted (to prevent reset on initial mount)
  const hasTabMounted = useRef(false);

  // Auth guard + role guard + populate form + fetch orders
  useEffect(() => {
    const localUser = getLocalUser();

    // Redirect only when auth fully resolved
    // AND no user in storage at all
    if (!authLoading && !currentUser && !localUser) {
      router.push("/");
      return;
    }

    // Use currentUser if available, else localUser
    const user = currentUser || localUser;

    if (!user) return;

    // Role guard
    if (user.role === "admin" || user.role === "owner") {
      router.push("/dashboard/business");
      return;
    }

    // Sync 2FA toggle from stored user
    setTwoFactorEnabled(!!user.two_factor_enabled);

    // Populate form
    setProfileForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      phoneNumber: user.phoneNumber || "",
    });
  }, [currentUser, authLoading, router]);

  // Reset password form when switching away from Security tab
  useEffect(() => {
    if (!hasTabMounted.current) {
      hasTabMounted.current = true;
      return;
    }
    if (activeTab !== "security") {
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordError("");
      setPasswordSuccess("");
    }
  }, [activeTab]);

  // Fetch addresses when Overview tab is activated
  useEffect(() => {
    if (activeTab !== "overview") return;
    if (!token) return;
    setOverviewAddrLoading(true);
    fetchWithTimeout(
      `${API_URL}/api/addresses`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      15000,
    )
      .then((r) => r.json())
      .then((d) => setOverviewAddresses(d.addresses || []))
      .catch(() => {})
      .finally(() => setOverviewAddrLoading(false));
  }, [activeTab, token]);

  // Fetch sessions when Security tab is activated
  useEffect(() => {
    if (activeTab !== "security") return;
    if (!token) return;

    const loadSessions = async () => {
      setSessionsLoading(true);
      setSessionsError("");
      try {
        const res = await fetchWithTimeout(
          `${API_URL}/api/sessions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
          30000,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load sessions");
        setSessions(data.sessions || []);
      } catch (err) {
        setSessionsError(err.message || "Failed to load sessions");
      } finally {
        setSessionsLoading(false);
      }
    };

    loadSessions();
    // Populate device tokens from stored user
    const raw =
      localStorage.getItem("auth_user") || sessionStorage.getItem("auth_user");
  }, [activeTab, token]);

  const handleProfileChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setSaveError("");
  };

  const handleSaveProfile = async () => {
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      setSaveError("First name and last name are required");
      return;
    }
    if (
      !profileForm.phoneNumber.trim() ||
      !/^(\+?63|0)9\d{9}$/.test(profileForm.phoneNumber.trim())
    ) {
      setSaveError(
        "Phone number must be a valid PH number (e.g. 09171234567 or +639171234567).",
      );
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            firstName: profileForm.firstName.trim(),
            lastName: profileForm.lastName.trim(),
            phoneNumber: profileForm.phoneNumber.trim(),
          }),
        },
        15000,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update profile");
      updateUser(data.data || data);
      setIsEditingProfile(false);
      setSaveSuccess("Profile updated successfully!");
      setTimeout(() => setSaveSuccess(""), 2500);
    } catch (err) {
      setSaveError(err.message || "An error occurred while saving");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordForm.currentPassword) {
      setPasswordError("Current password is required.");
      return;
    }
    const pw = passwordForm.newPassword;
    if (pw.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(pw)) {
      setPasswordError(
        "New password must contain at least one uppercase letter.",
      );
      return;
    }
    if (!/[a-z]/.test(pw)) {
      setPasswordError(
        "New password must contain at least one lowercase letter.",
      );
      return;
    }
    if (!/\d/.test(pw)) {
      setPasswordError("New password must contain at least one number.");
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) {
      setPasswordError(
        "New password must contain at least one special character.",
      );
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/profile/password`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword,
            password: passwordForm.newPassword,
            password_confirmation: passwordForm.confirmPassword,
          }),
        },
        15000,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update password");
      setPasswordSuccess("Password changed! Redirecting to login...");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setTimeout(() => {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        sessionStorage.removeItem("auth_token");
        sessionStorage.removeItem("auth_user");
        sessionStorage.setItem("sessionExpired", "true");
        router.replace("/");
      }, 2000);
    } catch (err) {
      setPasswordError(err.message || "Failed to update password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE MY ACCOUNT') {
      setDeleteError('Type DELETE MY ACCOUNT exactly to confirm.');
      return;
    }
    if (!deletePassword) {
      setDeleteError('Please enter your password.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const res = await fetch(`${API_URL}/api/profile`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePassword, reason: deleteReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.message || 'Failed to delete account.');
        return;
      }
      // Clear all local auth state and redirect
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_user');
      logout?.();
      router.replace('/?accountDeleted=1');
    } catch (err) {
      setDeleteError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setAvatarError("Only JPG, PNG, or WEBP files are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB.");
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError("");

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetchWithTimeout(
        `${API_URL}/api/profile/upload-avatar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
        30000,
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Upload failed.");
      }

      const avatarUrl = data.data?.avatar;
      if (!avatarUrl) {
        throw new Error("No avatar URL returned.");
      }

      updateUser({ avatar: avatarUrl });
      window.dispatchEvent(new CustomEvent("pmp_user_updated"));
      setProfileForm((prev) => ({ ...prev, avatar: avatarUrl }));
      setAvatarError("");
    } catch (err) {
      setAvatarError(err.message || "Upload failed. Try again.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleEditProfile = () => {
    setProfileSnapshot({ ...profileForm });
    setIsEditingProfile(true);
    setActiveTab("personal");
  };

  const handleCancelEdit = () => {
    if (profileSnapshot) {
      setProfileForm(profileSnapshot);
    }
    setIsEditingProfile(false);
    setSaveError("");
  };

  const handleRevokeSession = async (sessionId) => {
    setRevokingId(sessionId);
    setSessionsError("");
    setSessionsSuccess("");
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/sessions/${sessionId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
        15000,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to revoke session");
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionsSuccess("Session revoked.");
      setTimeout(() => setSessionsSuccess(""), 3000);
    } catch (err) {
      setSessionsError(err.message || "Failed to revoke session");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    setRevokeAllLoading(true);
    setSessionsError("");
    setSessionsSuccess("");
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/sessions/others/all`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
        15000,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to revoke sessions");
      setSessions((prev) => prev.filter((s) => s.is_current));
      setSessionsSuccess("All other sessions revoked.");
      setTimeout(() => setSessionsSuccess(""), 3000);
    } catch (err) {
      setSessionsError(err.message || "Failed to revoke sessions");
    } finally {
      setRevokeAllLoading(false);
    }
  };

  const formatMemberSince = (dateStr) => {
    if (!dateStr) return "Member since Recently";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Member since Recently";
    return `Member since ${date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
  };

  const getPasswordStrength = (pwd) => {
    if (!pwd) return null;
    const checks = [
      pwd.length >= 8,
      /[A-Z]/.test(pwd),
      /[a-z]/.test(pwd),
      /\d/.test(pwd),
      /[!@#$%^&*(),.?":{}|<>]/.test(pwd),
    ];
    const score = checks.filter(Boolean).length;
    const levels = [
      { label: "Too Weak", color: "var(--red)", width: "20%" },
      { label: "Weak", color: "var(--red)", width: "40%" },
      { label: "Fair", color: "var(--gold)", width: "60%" },
      { label: "Strong", color: "var(--green)", width: "80%" },
      { label: "Very Strong", color: "var(--green)", width: "100%" },
    ];
    const current = levels[score - 1] || {
      label: "Too Weak",
      color: "var(--red)",
      width: "20%",
    };
    return current;
  };

  // Render loading state
  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--darker)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="spinner" style={{ width: "40px", height: "40px" }} />
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--darker)" }}>
      {/* Back to Shop - standalone below global navbar */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0.75rem 2rem 0",
        }}
      >
        <Link href="/shop" className="back-to-shop-btn">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Shop
        </Link>
      </div>

      {/* Main Content */}
      <main
        className="profile-layout"
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "2rem",
          display: "flex",
          gap: "2rem",
          flexDirection: "row",
          alignItems: "flex-start",
        }}
      >
        {/* LEFT: Profile Card */}
        <aside
          style={{
            width: "260px",
            flexShrink: 0,
            background: "var(--dark2)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "1.5rem",
            position: "sticky",
            top: "5rem",
            height: "fit-content",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              position: "relative",
              width: "80px",
              height: "80px",
              margin: "0 auto 1rem",
            }}
            onMouseEnter={() => setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
          >
            {currentUser?.avatar ? (
              <Image
                src={currentUser.avatar}
                alt="avatar"
                width={80}
                height={80}
                style={{
                  borderRadius: "50%",
                  objectFit: "cover",
                  display: "block",
                }}
                unoptimized
              />
            ) : (
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  background: "var(--gold)",
                  color: "var(--black)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "2rem",
                }}
              >
                {currentUser?.firstName?.charAt(0)?.toUpperCase() || "U"}
              </div>
            )}
            {avatarHover && !isUploadingAvatar && (
              <label
                htmlFor="avatar-upload"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "40%",
                  borderBottomLeftRadius: "999px",
                  borderBottomRightRadius: "999px",
                  background: "rgba(0,0,0,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--white)"
                  strokeWidth="2"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </label>
            )}
            {!avatarHover && !isUploadingAvatar && (
              <label
                htmlFor="avatar-upload"
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  background: "var(--gold)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: "2px solid var(--dark2)",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--black)"
                  strokeWidth="2.5"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </label>
            )}
            {isUploadingAvatar && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  background: "var(--gold)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid var(--dark2)",
                }}
              >
                <span
                  className="spinner"
                  style={{ width: "12px", height: "12px" }}
                />
              </div>
            )}
            <input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              disabled={isUploadingAvatar}
              onChange={handleAvatarUpload}
            />
          </div>

          {/* Name */}
          <div style={{ textAlign: "center", marginBottom: "0.25rem" }}>
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                color: "var(--white)",
              }}
            >
              {currentUser?.firstName || ""} {currentUser?.lastName || ""}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--gray)",
                marginTop: "0.25rem",
              }}
            >
              {currentUser?.email || ""}
            </div>
          </div>

          {/* Role Badge and Member Since */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              marginTop: "8px",
            }}
          >
            {/* Role Badge */}
            {(() => {
              const role = (currentUser?.role || "customer").toLowerCase();
              const badgeStyles = {
                admin: {
                  background: "var(--red)",
                  color: "var(--white)",
                  border: "1px solid var(--red)",
                },
                seller: {
                  background: "var(--gold)",
                  color: "var(--black)",
                  border: "1px solid var(--gold)",
                },
                customer: {
                  background: "transparent",
                  color: "var(--gray)",
                  border: "1px solid var(--border)",
                },
              };
              const style = badgeStyles[role] || badgeStyles.customer;
              return (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: "999px",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    ...style,
                  }}
                >
                  {role}
                </span>
              );
            })()}

            {/* Member Since */}
            <div style={{ fontSize: "0.75rem", color: "var(--gray)" }}>
              {formatMemberSince(
                currentUser?.createdAt || currentUser?.lastLogin,
              )}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: "1px",
              background: "var(--border)",
              margin: "1.25rem 0",
            }}
          />

          {/* Navigation Buttons */}
          <nav
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <button
              onClick={() => setActiveTab("overview")}
              className={`profile-nav-item${activeTab === "overview" ? " active" : ""}`}
              style={{
                padding: "0.625rem 1rem",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Overview
            </button>
            <button
              onClick={() => setActiveTab("personal")}
              className={`profile-nav-item${activeTab === "personal" ? " active" : ""}`}
              style={{
                padding: "0.625rem 1rem",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Personal Info
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`profile-nav-item${activeTab === "security" ? " active" : ""}`}
              style={{
                padding: "0.625rem 1rem",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Security
            </button>
            <button
              onClick={() => setActiveTab("addresses")}
              className={`profile-nav-item${activeTab === "addresses" ? " active" : ""}`}
              style={{
                padding: "0.625rem 1rem",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Addresses
            </button>
          </nav>
        </aside>

        {/* RIGHT: Tab Content */}
        <section style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              background: "var(--dark2)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "2rem",
            }}
          >
            {/* TAB 1: Overview */}
            {activeTab === "overview" && (
              <div>
                <h2
                  style={{
                    margin: "0 0 1.5rem",
                    fontSize: "1.25rem",
                    color: "var(--white)",
                  }}
                >
                  Profile Overview
                </h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--gray)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      First Name
                    </div>
                    <div style={{ fontSize: "0.95rem", color: "var(--white)" }}>
                      {profileForm.firstName || "—"}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--gray)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Last Name
                    </div>
                    <div style={{ fontSize: "0.95rem", color: "var(--white)" }}>
                      {profileForm.lastName || "—"}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--gray)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Email
                    </div>
                    <div style={{ fontSize: "0.95rem", color: "var(--white)" }}>
                      {profileForm.email || "—"}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--gray)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Phone
                    </div>
                    <div style={{ fontSize: "0.95rem", color: "var(--white)" }}>
                      {profileForm.phoneNumber || "—"}
                    </div>
                  </div>
                </div>

                {/* Saved Addresses */}
                <div
                  style={{
                    marginTop: "2rem",
                    borderTop: "1px solid var(--border)",
                    paddingTop: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "1rem",
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "var(--white)",
                      }}
                    >
                      Saved Addresses
                    </h4>
                    <button
                      onClick={() => setActiveTab("addresses")}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--gold)",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 600,
                      }}
                    >
                      Manage →
                    </button>
                  </div>

                  {overviewAddrLoading ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            height: "60px",
                            background: "var(--dark)",
                            borderRadius: "10px",
                            border: "1px solid var(--border)",
                            animation: "pulse 1.5s ease-in-out infinite",
                          }}
                        />
                      ))}
                    </div>
                  ) : overviewAddresses.length === 0 ? (
                    <div
                      style={{
                        padding: "1.5rem",
                        textAlign: "center",
                        background: "var(--dark)",
                        borderRadius: "10px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 0.75rem",
                          fontSize: "0.85rem",
                          color: "var(--gray)",
                        }}
                      >
                        No saved addresses yet.
                      </p>
                      <button
                        onClick={() => setActiveTab("addresses")}
                        style={{
                          padding: "0.5rem 1rem",
                          background: "var(--gold)",
                          border: "none",
                          borderRadius: "8px",
                          color: "#000",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Add Address
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.875rem",
                      }}
                    >
                      {overviewAddresses.map((addr) => {
                        const parts = [
                          addr.house_number && addr.street
                            ? `${addr.house_number} ${addr.street}`
                            : "",
                          addr.subdivision,
                          addr.barangay ? `Brgy. ${addr.barangay}` : "",
                          addr.city,
                          addr.province,
                          addr.zip,
                        ]
                          .filter(Boolean)
                          .join(", ");
                        const isPinned = !!(addr.lat && addr.lng);
                        return (
                          <div
                            key={addr.id}
                            style={{
                              background: addr.is_default
                                ? "rgba(212,168,67,0.05)"
                                : "var(--dark)",
                              border: `1px solid ${addr.is_default ? "rgba(212,168,67,0.3)" : "var(--border)"}`,
                              borderRadius: "10px",
                              overflow: "hidden",
                            }}
                          >
                            <div style={{ padding: "0.875rem 1rem" }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  marginBottom: "0.375rem",
                                  flexWrap: "wrap",
                                }}
                              >
                                {addr.label && (
                                  <span
                                    style={{
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      padding: "1px 8px",
                                      borderRadius: "999px",
                                      background: "rgba(255,255,255,0.08)",
                                      color: "var(--white)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                    }}
                                  >
                                    {addr.label}
                                  </span>
                                )}
                                {addr.is_default && (
                                  <span
                                    style={{
                                      fontSize: "0.65rem",
                                      fontWeight: 700,
                                      padding: "1px 8px",
                                      borderRadius: "999px",
                                      background: "rgba(212,168,67,0.15)",
                                      color: "var(--gold)",
                                      border: "1px solid rgba(212,168,67,0.3)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                    }}
                                  >
                                    Default
                                  </span>
                                )}
                                <span
                                  style={{
                                    marginLeft: "auto",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    fontSize: "0.7rem",
                                    color: isPinned ? "#4ade80" : "var(--gray)",
                                  }}
                                >
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  {isPinned ? "Pinned" : "Not pinned"}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: "0.82rem",
                                  color: "var(--gray)",
                                  lineHeight: 1.5,
                                }}
                              >
                                {parts || "—"}
                              </div>
                              {addr.phone && (
                                <div
                                  style={{
                                    fontSize: "0.78rem",
                                    color: "var(--gray)",
                                    marginTop: "0.25rem",
                                  }}
                                >
                                  {addr.phone}
                                </div>
                              )}
                            </div>
                            {isPinned && (
                              <div style={{ padding: "0 0.875rem 0.875rem" }}>
                                <ReadOnlyPinMap
                                  lat={addr.lat}
                                  lng={addr.lng}
                                  height={160}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Personal Info */}
            {activeTab === "personal" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "1.5rem",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.25rem",
                      color: "var(--white)",
                    }}
                  >
                    Personal Information
                  </h2>
                  {!isEditingProfile ? (
                    <button
                      onClick={handleEditProfile}
                      style={{
                        padding: "0.5rem 1rem",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--white)",
                        fontSize: "0.875rem",
                        cursor: "pointer",
                      }}
                    >
                      Edit Profile
                    </button>
                  ) : (
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        padding: "0.5rem 1rem",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--gray)",
                        fontSize: "0.875rem",
                        cursor: "pointer",
                      }}
                    >
                      Cancel Editing
                    </button>
                  )}
                </div>

                {saveSuccess && (
                  <div
                    style={{
                      marginBottom: "1rem",
                      padding: "0.75rem 1rem",
                      background: "rgba(34, 197, 94, 0.1)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      borderRadius: "8px",
                      color: "var(--gold)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    {saveSuccess}
                  </div>
                )}

                {saveError && (
                  <div
                    style={{
                      marginBottom: "1rem",
                      padding: "0.75rem 1rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "8px",
                      color: "var(--red)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {saveError}
                  </div>
                )}

                {!isEditingProfile ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--gray)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        First Name
                      </div>
                      <div
                        style={{ fontSize: "0.95rem", color: "var(--white)" }}
                      >
                        {profileForm.firstName || "—"}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--gray)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Last Name
                      </div>
                      <div
                        style={{ fontSize: "0.95rem", color: "var(--white)" }}
                      >
                        {profileForm.lastName || "—"}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--gray)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Email
                      </div>
                      <div
                        style={{ fontSize: "0.95rem", color: "var(--white)" }}
                      >
                        {profileForm.email || "—"}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--gray)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Phone
                      </div>
                      <div
                        style={{ fontSize: "0.95rem", color: "var(--white)" }}
                      >
                        {profileForm.phoneNumber || "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: "var(--gray)",
                          marginBottom: "0.4rem",
                        }}
                      >
                        First Name{" "}
                        <span style={{ color: "var(--red)" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={(e) =>
                          handleProfileChange("firstName", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: "var(--gray)",
                          marginBottom: "0.4rem",
                        }}
                      >
                        Last Name <span style={{ color: "var(--red)" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={(e) =>
                          handleProfileChange("lastName", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: "var(--gray)",
                          marginBottom: "0.4rem",
                        }}
                      >
                        Email Address{" "}
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            fontSize: "0.75rem",
                            color: "var(--gray)",
                          }}
                        >
                          (cannot be changed)
                        </span>
                      </label>
                      <input
                        type="email"
                        value={profileForm.email}
                        disabled
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          background: "var(--dark3)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--gray)",
                          fontSize: "0.875rem",
                          cursor: "not-allowed",
                          opacity: 0.6,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          color: "var(--gray)",
                          marginBottom: "0.4rem",
                        }}
                      >
                        Phone Number{" "}
                        <span style={{ color: "var(--red)" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={profileForm.phoneNumber}
                        onChange={(e) =>
                          handleProfileChange("phoneNumber", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        gap: "0.75rem",
                        justifyContent: "flex-end",
                        paddingTop: "0.5rem",
                      }}
                    >
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: "0.625rem 1.25rem",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--gray)",
                          fontSize: "0.875rem",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        style={{
                          padding: "0.625rem 1.5rem",
                          background: isSaving ? "var(--dark3)" : "var(--gold)",
                          border: "none",
                          borderRadius: "8px",
                          color: isSaving ? "var(--gray)" : "var(--black)",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          cursor: isSaving ? "not-allowed" : "pointer",
                        }}
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Security */}
            {activeTab === "security" && (
              <div style={{ maxWidth: "500px" }}>
                <h2
                  style={{
                    margin: "0 0 1.25rem",
                    fontSize: "1.25rem",
                    color: "var(--white)",
                  }}
                >
                  Change Password
                </h2>

                <div
                  style={{
                    padding: "1rem",
                    background: "rgba(212, 168, 67, 0.1)",
                    borderRadius: "8px",
                    border: "1px solid rgba(212, 168, 67, 0.3)",
                    marginBottom: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--gold)"
                      strokeWidth="2"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <strong style={{ color: "var(--gold)" }}>
                      Password Security
                    </strong>
                  </div>
                  <p style={{ fontSize: "0.85rem", opacity: 0.8, margin: 0 }}>
                    Change it regularly to keep your account safe.
                  </p>
                </div>

                {passwordError && (
                  <div
                    style={{
                      marginBottom: "1rem",
                      padding: "0.75rem 1rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "8px",
                      color: "var(--red)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div
                    style={{
                      marginBottom: "1rem",
                      padding: "0.75rem 1rem",
                      background: "rgba(34, 197, 94, 0.1)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      borderRadius: "8px",
                      color: "var(--gold)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    {passwordSuccess}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: "var(--gray)",
                        marginBottom: "0.4rem",
                      }}
                    >
                      Current Password{" "}
                      <span style={{ color: "var(--red)" }}>*</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPasswords.current ? "text" : "password"}
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            currentPassword: e.target.value,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          paddingRight: "3rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
                          boxSizing: "border-box",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords({
                            ...showPasswords,
                            current: !showPasswords.current,
                          })
                        }
                        style={{
                          position: "absolute",
                          right: "0.75rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "transparent",
                          border: "none",
                          color: "var(--gray)",
                          cursor: "pointer",
                          padding: "0.25rem",
                        }}
                      >
                        {showPasswords.current ? (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: "var(--gray)",
                        marginBottom: "0.4rem",
                      }}
                    >
                      New Password{" "}
                      <span style={{ color: "var(--red)" }}>*</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPasswords.newPass ? "text" : "password"}
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            newPassword: e.target.value,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          paddingRight: "3rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
                          boxSizing: "border-box",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords({
                            ...showPasswords,
                            newPass: !showPasswords.newPass,
                          })
                        }
                        style={{
                          position: "absolute",
                          right: "0.75rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "transparent",
                          border: "none",
                          color: "var(--gray)",
                          cursor: "pointer",
                          padding: "0.25rem",
                        }}
                      >
                        {showPasswords.newPass ? (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {passwordForm.newPassword.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--border)",
                          borderRadius: "10px",
                          padding: "0.75rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.4rem",
                          }}
                        >
                          {[
                            {
                              label: "At least 8 characters",
                              pass: passwordForm.newPassword.length >= 8,
                            },
                            {
                              label: "One uppercase letter",
                              pass: /[A-Z]/.test(passwordForm.newPassword),
                            },
                            {
                              label: "One lowercase letter",
                              pass: /[a-z]/.test(passwordForm.newPassword),
                            },
                            {
                              label: "One number",
                              pass: /\d/.test(passwordForm.newPassword),
                            },
                            {
                              label: "One special character",
                              pass: /[!@#$%^&*(),.?":{}|<>]/.test(
                                passwordForm.newPassword,
                              ),
                            },
                          ].map((c, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                fontSize: "0.78rem",
                                color: c.pass ? "var(--green)" : "var(--gray)",
                                transition: "color 0.2s",
                              }}
                            >
                              {c.pass ? (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="var(--green)"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ flexShrink: 0 }}
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ flexShrink: 0, opacity: 0.3 }}
                                >
                                  <circle cx="12" cy="12" r="2" />
                                </svg>
                              )}
                              {c.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(() => {
                      if (!passwordForm.newPassword) return null;
                      const strength = getPasswordStrength(
                        passwordForm.newPassword,
                      );
                      if (!strength) return null;
                      return (
                        <div style={{ marginTop: "6px" }}>
                          <div
                            style={{
                              height: "4px",
                              borderRadius: "2px",
                              background: "var(--border)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: strength.width,
                                background: strength.color,
                                transition: "width 0.3s ease",
                                borderRadius: "2px",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: strength.color,
                              marginTop: "4px",
                              display: "block",
                            }}
                          >
                            {strength.label}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        color: "var(--gray)",
                        marginBottom: "0.4rem",
                      }}
                    >
                      Confirm New Password{" "}
                      <span style={{ color: "var(--red)" }}>*</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPasswords.confirm ? "text" : "password"}
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            confirmPassword: e.target.value,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.75rem",
                          paddingRight: "3rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
                          boxSizing: "border-box",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords({
                            ...showPasswords,
                            confirm: !showPasswords.confirm,
                          })
                        }
                        style={{
                          position: "absolute",
                          right: "0.75rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "transparent",
                          border: "none",
                          color: "var(--gray)",
                          cursor: "pointer",
                          padding: "0.25rem",
                        }}
                      >
                        {showPasswords.confirm ? (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleSavePassword}
                    disabled={isSavingPassword}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.75rem 1.5rem",
                      background: isSavingPassword
                        ? "var(--gray)"
                        : "var(--gold)",
                      border: "none",
                      borderRadius: "8px",
                      color: isSavingPassword ? "var(--dark)" : "var(--black)",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: isSavingPassword ? "not-allowed" : "pointer",
                      width: "fit-content",
                    }}
                  >
                    {isSavingPassword ? "Updating..." : "Update Password"}
                  </button>
                </div>

                {/* Active Sessions Section */}
                <div
                  style={{
                    marginTop: "2.5rem",
                    paddingTop: "2rem",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "1.25rem",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "var(--white)",
                        }}
                      >
                        Active Sessions
                      </h3>
                      <p
                        style={{
                          margin: "0.25rem 0 0",
                          fontSize: "0.8rem",
                          color: "var(--gray)",
                        }}
                      >
                        Devices currently logged into your account.
                      </p>
                    </div>
                    {sessions.filter((s) => !s.is_current).length > 0 && (
                      <button
                        onClick={handleRevokeAllOthers}
                        disabled={revokeAllLoading}
                        style={{
                          padding: "0.5rem 1rem",
                          background: "rgba(239,68,68,0.1)",
                          border: "1px solid rgba(239,68,68,0.3)",
                          borderRadius: "8px",
                          color: "var(--red)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: revokeAllLoading ? "not-allowed" : "pointer",
                          opacity: revokeAllLoading ? 0.6 : 1,
                          transition: "all 0.2s",
                        }}
                      >
                        {revokeAllLoading ? "Revoking..." : "Revoke All Others"}
                      </button>
                    )}
                    <button
                      onClick={() => setSessionsOpen((v) => !v)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--gold)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        padding: "0.25rem 0.5rem",
                      }}
                    >
                      {sessionsOpen ? "Hide" : "Show"}
                    </button>
                  </div>

                  {sessionsOpen && (
                    <>
                      {sessionsSuccess && (
                        <div
                          style={{
                            marginBottom: "1rem",
                            padding: "0.75rem 1rem",
                            background: "rgba(74,222,128,0.08)",
                            border: "1px solid rgba(74,222,128,0.25)",
                            borderRadius: "8px",
                            color: "var(--green)",
                            fontSize: "0.85rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {sessionsSuccess}
                        </div>
                      )}

                      {sessionsError && (
                        <div
                          style={{
                            marginBottom: "1rem",
                            padding: "0.75rem 1rem",
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.25)",
                            borderRadius: "8px",
                            color: "var(--red)",
                            fontSize: "0.85rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          {sessionsError}
                        </div>
                      )}

                      {sessionsLoading ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                          }}
                        >
                          {[1, 2].map((i) => (
                            <div
                              key={i}
                              style={{
                                padding: "1rem",
                                background: "var(--dark)",
                                border: "1px solid var(--border)",
                                borderRadius: "10px",
                                height: "72px",
                                animation: "pulse 1.5s ease-in-out infinite",
                              }}
                            />
                          ))}
                        </div>
                      ) : sessions.length === 0 ? (
                        <div
                          style={{
                            padding: "2rem",
                            textAlign: "center",
                            color: "var(--gray)",
                            fontSize: "0.85rem",
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid var(--border)",
                            borderRadius: "10px",
                          }}
                        >
                          No active sessions found.
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                          }}
                        >
                          {sessions.map((session) => (
                            <div
                              key={session.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "1rem 1.25rem",
                                background: session.is_current
                                  ? "rgba(212,168,67,0.06)"
                                  : "var(--dark)",
                                border: session.is_current
                                  ? "1px solid rgba(212,168,67,0.25)"
                                  : "1px solid var(--border)",
                                borderRadius: "10px",
                                gap: "1rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.875rem",
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <div
                                  style={{
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "8px",
                                    background: session.is_current
                                      ? "rgba(212,168,67,0.15)"
                                      : "rgba(255,255,255,0.05)",
                                    border: session.is_current
                                      ? "1px solid rgba(212,168,67,0.3)"
                                      : "1px solid var(--border)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    color: session.is_current
                                      ? "var(--gold)"
                                      : "var(--gray)",
                                  }}
                                >
                                  <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="2"
                                      y="3"
                                      width="20"
                                      height="14"
                                      rx="2"
                                      ry="2"
                                    />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                  </svg>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.5rem",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "0.875rem",
                                        fontWeight: 600,
                                        color: "var(--white)",
                                        textTransform: "capitalize",
                                      }}
                                    >
                                      {session.name || "Web Session"}
                                    </span>
                                    {session.is_current && (
                                      <span
                                        style={{
                                          fontSize: "0.65rem",
                                          fontWeight: 700,
                                          padding: "1px 7px",
                                          borderRadius: "999px",
                                          background: "rgba(212,168,67,0.15)",
                                          color: "var(--gold)",
                                          border:
                                            "1px solid rgba(212,168,67,0.3)",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.05em",
                                        }}
                                      >
                                        Current
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--gray)",
                                      marginTop: "0.2rem",
                                    }}
                                  >
                                    Last active: {session.last_used_at}
                                    {" · "}
                                    Since: {session.created_at}
                                  </div>
                                </div>
                              </div>

                              {!session.is_current && (
                                <button
                                  onClick={() =>
                                    handleRevokeSession(session.id)
                                  }
                                  disabled={revokingId === session.id}
                                  style={{
                                    padding: "0.4rem 0.875rem",
                                    background: "transparent",
                                    border: "1px solid rgba(239,68,68,0.35)",
                                    borderRadius: "7px",
                                    color: "var(--red)",
                                    fontSize: "0.78rem",
                                    fontWeight: 600,
                                    cursor:
                                      revokingId === session.id
                                        ? "not-allowed"
                                        : "pointer",
                                    opacity:
                                      revokingId === session.id ? 0.5 : 1,
                                    flexShrink: 0,
                                    transition: "all 0.2s",
                                  }}
                                >
                                  {revokingId === session.id
                                    ? "Revoking..."
                                    : "Revoke"}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <TwoFactorSection
                token={token}
                twoFactorEnabled={twoFactorEnabled}
                setTwoFactorEnabled={setTwoFactorEnabled}
              />
            )}

            {/* Delete Account — Danger Zone */}
            {activeTab === "security" && (
              <div style={{ maxWidth: '500px', marginTop: '2rem' }}>
                <div style={{
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.85)" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                      </svg>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'rgba(239,68,68,0.9)' }}>Delete Account</span>
                    </div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                      Removes your personal info. You won't be able to log in again.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {[
                        'No active orders',
                        'No unpaid balances',
                      ].map(cond => (
                        <span key={cond} style={{
                          fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px',
                          borderRadius: '999px', background: 'rgba(239,68,68,0.08)',
                          color: 'rgba(239,68,68,0.75)', border: '1px solid rgba(239,68,68,0.18)',
                        }}>
                          ✓ {cond}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDeleteModalOpen(true); setDeleteError(''); setDeletePassword(''); setDeleteReason(''); setDeleteConfirmText(''); }}
                    style={{
                      flexShrink: 0,
                      padding: '0.5rem 1rem', borderRadius: '8px',
                      border: '1px solid rgba(239,68,68,0.45)',
                      background: 'transparent', color: 'rgba(239,68,68,0.9)',
                      fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            )}

            {/* Delete Account Confirmation Modal */}
            {deleteModalOpen && (
              <div style={{
                position: 'fixed', inset: 0, zIndex: 2000,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
              }}>
                <div style={{
                  width: '100%', maxWidth: '460px',
                  background: 'var(--dark2)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '16px', overflow: 'hidden',
                }}>
                  {/* Modal header */}
                  <div style={{
                    padding: '1.1rem 1.5rem',
                    background: 'rgba(239,68,68,0.08)',
                    borderBottom: '1px solid rgba(239,68,68,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.9)" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'rgba(239,68,68,0.95)' }}>Delete Account</span>
                    </div>
                    <button type="button" onClick={() => setDeleteModalOpen(false)} disabled={deleteLoading}
                      style={{ background: 'transparent', border: 'none', color: 'var(--gray)', cursor: 'pointer', lineHeight: 1, padding: '4px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>

                  <div style={{ padding: '1.25rem 1.5rem', maxHeight: '80vh', overflowY: 'auto' }}>
                    {/* What happens — two columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.25rem' }}>
                      <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', fontSize: '0.77rem', lineHeight: 1.6, color: 'var(--gray)' }}>
                        <strong style={{ color: 'var(--white)', display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem' }}>Removed</strong>
                        Your name, email, phone, address, profile photo, and login access.
                      </div>
                      <div style={{ padding: '0.75rem', background: 'rgba(34,197,94,0.05)', borderRadius: '8px', fontSize: '0.77rem', lineHeight: 1.6, color: 'var(--gray)' }}>
                        <strong style={{ color: 'var(--white)', display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem' }}>Kept</strong>
                        Order and payment history (required by law, stored anonymously).
                      </div>
                    </div>

                    {/* Reason */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                        Why are you leaving? (optional)
                      </label>
                      <select
                        value={deleteReason}
                        onChange={e => setDeleteReason(e.target.value)}
                        style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', fontSize: '0.875rem' }}
                      >
                        <option value="">Prefer not to say</option>
                        <option value="No longer using the service">No longer using the service</option>
                        <option value="Privacy concerns">Privacy concerns</option>
                        <option value="Switching to another provider">Switching to another provider</option>
                        <option value="Poor experience">Poor experience</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                        Confirm your password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={deleteShowPassword ? 'text' : 'password'}
                          value={deletePassword}
                          onChange={e => setDeletePassword(e.target.value)}
                          placeholder="Enter your current password"
                          style={{ width: '100%', height: '40px', padding: '0 40px 0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' }}
                        />
                        <button type="button" onClick={() => setDeleteShowPassword(v => !v)}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                          {deleteShowPassword
                            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          }
                        </button>
                      </div>
                    </div>

                    {/* Typed confirmation */}
                    <div style={{ marginBottom: '1.25rem' }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                        Type <span style={{ color: 'rgba(239,68,68,0.9)', fontFamily: 'monospace', letterSpacing: 0 }}>DELETE MY ACCOUNT</span> to continue
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={e => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE MY ACCOUNT"
                        style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: `1px solid ${deleteConfirmText === 'DELETE MY ACCOUNT' ? 'rgba(239,68,68,0.55)' : 'var(--border)'}`, background: 'var(--dark)', color: deleteConfirmText === 'DELETE MY ACCOUNT' ? 'rgba(239,68,68,0.9)' : 'var(--white)', fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'monospace' }}
                      />
                    </div>

                    {deleteError && (
                      <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(239,68,68,0.95)', fontSize: '0.82rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                        {deleteError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setDeleteModalOpen(false)} disabled={deleteLoading}
                        style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--white)', cursor: deleteLoading ? 'not-allowed' : 'pointer', opacity: deleteLoading ? 0.6 : 1, fontSize: '0.875rem' }}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAccount}
                        disabled={deleteLoading || deleteConfirmText !== 'DELETE MY ACCOUNT' || !deletePassword}
                        style={{
                          padding: '10px 20px', borderRadius: '8px', border: 'none',
                          background: deleteLoading || deleteConfirmText !== 'DELETE MY ACCOUNT' || !deletePassword ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.85)',
                          color: 'white', fontWeight: 700, cursor: deleteLoading || deleteConfirmText !== 'DELETE MY ACCOUNT' || !deletePassword ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >
                        {deleteLoading ? 'Deleting…' : 'Permanently Delete Account'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Addresses */}
            {activeTab === "addresses" && <AddressBook />}
          </div>
        </section>
      </main>
    </div>
  );
}
