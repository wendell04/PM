"use client";

import { updatePassword } from "@/lib/authApi";
import { disconnectEcho, getEcho } from "@/lib/echo";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notificationApi";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import "./admin-dashboard.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function BusinessDashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, currentUser, updateUser, token } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Notification state
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef(null);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    address: "",
    businessName: "",
    businessType: "",
    taxId: "",
    website: "",
    bio: "",
  });

  const [activeTab, setActiveTab] = useState("personal");

  // Profile edit mode state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileSnapshot, setProfileSnapshot] = useState(null);

  // Ref to track if tab has mounted (to prevent reset on initial mount)
  const hasTabMounted = useRef(false);

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Password visibility toggles
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    newPass: false,
    confirm: false,
  });

  // Profile view state
  const [profileViewOpen, setProfileViewOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showAvatarFallback, setShowAvatarFallback] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState(false);

  useEffect(() => {
    if (currentUser) {
      const allowedRoles = [
        "admin",
        "owner",
        "salesRep",
        "productionOperator",
        "qualityControl",
        "cashier",
        "inventoryManager",
      ];
      if (!allowedRoles.includes(currentUser.role)) {
        router.replace("/shop");
        return;
      }
      setProfileForm({
        firstName: currentUser.firstName || "",
        lastName: currentUser.lastName || "",
        email: currentUser.email || "",
        phoneNumber: currentUser.phoneNumber || "",
        address: currentUser.address || "",
        businessName: currentUser.businessName || "",
        businessType: currentUser.businessType || "",
        taxId: currentUser.taxId || "",
        website: currentUser.website || "",
        bio: currentUser.bio || "",
      });
    }
  }, [currentUser, router]);

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

  const handleLogout = () => {
    setLogoutConfirmOpen(true);
  };

  const confirmLogout = async () => {
    setLogoutConfirmOpen(false);
    await logout();
  };

  const handleProfileChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setSaveError("");
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setAvatarError("Only JPG, PNG, or WEBP allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB.");
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError("");

    try {
      const token =
        sessionStorage.getItem("auth_token") ||
        localStorage.getItem("auth_token");

      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch(`${API_URL}/api/profile/upload-avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Upload failed.");
      }

      const avatarUrl = data.data?.avatar;
      if (!avatarUrl) {
        throw new Error("No avatar URL returned.");
      }

      updateUser({ avatar: avatarUrl });
      setProfileForm((prev) => ({ ...prev, avatar: avatarUrl }));
      setShowAvatarFallback(false);
      setAvatarError("");
      setAvatarSuccess(true);
      setTimeout(() => setAvatarSuccess(false), 3000);
    } catch (err) {
      setAvatarError(err.message || "Upload failed. Try again.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      setSaveError("First name and last name are required");
      return;
    }
    if (
      !profileForm.email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email)
    ) {
      setSaveError("Please enter a valid email address");
      return;
    }
    if (!profileForm.phoneNumber.trim()) {
      setSaveError("Phone number is required");
      return;
    }
    if (!profileForm.address.trim()) {
      setSaveError("Address is required");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const token =
        sessionStorage.getItem("auth_token") ||
        localStorage.getItem("auth_token");
      const response = await fetchWithTimeout(
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
            email: profileForm.email.trim(),
            phoneNumber: profileForm.phoneNumber.trim(),
            address: profileForm.address.trim(),
          }),
        },
        15000,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update profile");
      }

      // Update local storage with new user data
      if (data.data) {
        updateUser(data.data);
      }

      setSaveSuccess("Profile updated successfully!");
      setTimeout(() => {
        setSaveSuccess("");
        setProfileModalOpen(false);
        setShowAvatarFallback(false);
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setPasswordError("");
        setPasswordSuccess("");
        setActiveTab("personal");
        setIsEditingProfile(false);
        setProfileSnapshot(null);
      }, 1500);
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
    if (passwordForm.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const token =
        sessionStorage.getItem("auth_token") ||
        localStorage.getItem("auth_token");
      await updatePassword(token, {
        currentPassword: passwordForm.currentPassword,
        password: passwordForm.newPassword,
        password_confirmation: passwordForm.confirmPassword,
      });
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
        sessionStorage.setItem("justLoggedOut", "true");
        router.replace("/");
      }, 2000);
    } catch (err) {
      setPasswordError(
        err.message || "Failed to update password. Please try again.",
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Poll unread count every 60 seconds
  // Stops polling after 3 consecutive failures to prevent console spam
  useEffect(() => {
    if (!token) return;
    let failCount = 0;
    let interval;
    const poll = async () => {
      try {
        const data = await fetchUnreadCount(token);
        setUnreadCount(data.unread_count ?? 0);
        failCount = 0;
      } catch {
        failCount += 1;
        if (failCount >= 3) {
          clearInterval(interval);
        }
      }
    };
    poll();
    interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [token]);

  // Reverb/Echo — real-time order status updates on admin channel
  useEffect(() => {
    if (!token) return;
    const echo = getEcho(token);
    if (!echo) return;

    try {
      echo.private("admin.notifications")
        .listen(".order.status.updated", () => {
          setUnreadCount((prev) => prev + 1);
        });
    } catch {
      // Echo/Reverb not reachable — silently ignore (HTTP polling still covers it)
    }

    return () => {
      disconnectEcho();
    };
  }, [token]);

  // Close notification panel on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpenNotifications = useCallback(async () => {
    const isOpening = !notifOpen;
    setNotifOpen(isOpening);
    if (!isOpening) return;
    setNotifLoading(true);
    try {
      const data = await fetchNotifications(token);
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // silent fail
    } finally {
      setNotifLoading(false);
    }
  }, [notifOpen, token]);

  const handleMarkRead = useCallback(
    async (id) => {
      try {
        const data = await markNotificationRead(id, token);
        setUnreadCount(data.unread_count ?? 0);
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === id || n.id === id ? { ...n, is_read: true } : n,
          ),
        );
      } catch {
        // silent fail
      }
    },
    [token],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead(token);
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // silent fail
    }
  }, [token]);

  const [expandedItems, setExpandedItems] = useState([]);

  const permsCacheRef = useRef(null);

  // Fetch role permissions on mount
  useEffect(() => {
    if (!token) return;
    if (permsCacheRef.current?.token === token) {
      setPermissions(permsCacheRef.current.permissions);
      return;
    }
    fetch(`${API_URL}/api/my/permissions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "ngrok-skip-browser-warning": "1",
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data?.permissions) {
          permsCacheRef.current = {
            token,
            permissions: data.data.permissions,
          };
          setPermissions(data.data.permissions);
        }
      })
      .catch(() => {}); // non-fatal — sidebar degrades gracefully
  }, [token]);

  // Returns true if admin/owner (always full access) or permission is granted
  const can = (key) => {
    if (!currentUser) return false;
    if (["admin", "owner"].includes(currentUser.role)) return true;
    if (!permissions) return false;
    return permissions[key] === true;
  };
  const isAdminOwner = ["admin", "owner"].includes(currentUser?.role);

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard/business/dashboardoverview",
      permKey: "dashboard",
      icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
    },
    {
      name: "Orders",
      permKey: "orders",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      children: [
        { name: "All Orders", href: "/dashboard/business/orders" },
        { name: "Requests", href: "/dashboard/business/order-requests" },
        { name: "Job Orders", href: "/dashboard/business/job-orders" },
      ],
    },
    {
      name: "POS",
      href: "/dashboard/business/pos",
      permKey: "pos",
      icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    },
    {
      name: "Inventory",
      permKey: "inventory",
      icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
      children: [
        {
          name: "Master Data",
          href: "/dashboard/business/inventory/master-data",
        },
        { name: "Stock In", href: "/dashboard/business/inventory/stock-in" },
        { name: "Overview", href: "/dashboard/business/inventory/stocks" },
        { name: "Bad Orders", href: "/dashboard/business/inventory/returns" },
      ],
    },
    {
      name: "Products",
      permKey: "products",
      icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
      children: [
        { name: "Catalog", href: "/dashboard/business/products" },
        { name: "Banners", href: "/dashboard/business/banners" },
      ],
    },
    {
      name: "Marketing",
      permKey: "flashSales",
      marketingGroup: true,
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
      children: [
        {
          name: "Flash Sales",
          href: "/dashboard/business/flash-sales",
          permKey: "flashSales",
        },
        {
          name: "Vouchers",
          href: "/dashboard/business/vouchers",
          permKey: "vouchers",
        },
      ],
    },
    {
      name: "Finance",
      permKey: "sales",
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      children: [
        { name: "Sales", href: "/dashboard/business/sales" },
        { name: "Reports", href: "/dashboard/business/reports" },
        { name: "Forecast", href: "/dashboard/business/ssa-forecast" },
      ],
    },
    {
      name: "Audit Logs",
      href: "/dashboard/business/audit-logs",
      permKey: "auditLogs",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      name: "Settings",
      href: "/dashboard/business/settings",
      permKey: "dashboard",
      icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    },
    {
      name: "Users & Roles",
      permKey: "userManagement",
      icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z",
      children: [
        { name: "Users", href: "/dashboard/business/users" },
        {
          name: "Permissions",
          href: "/dashboard/business/role-permissions",
        },
      ],
    },
  ];

  const toggleExpanded = (itemName) => {
    setExpandedItems((prev) =>
      prev.includes(itemName)
        ? prev.filter((name) => name !== itemName)
        : [...prev, itemName],
    );
  };

  const isChildActive = (children) => {
    return children.some((child) => pathname === child.href);
  };

  const getInitials = (user) => {
    if (!user) return "?";
    const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    if (!name) return user.email?.charAt(0)?.toUpperCase() || "?";
    return name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0].toUpperCase())
      .slice(0, 2)
      .join("");
  };

  const currentPageName = useMemo(() => {
    const map = {
      "/dashboard/business/dashboardoverview": "Dashboard",
      "/dashboard/business/orders": "Orders",
      "/dashboard/business/order-requests": "Order Requests",
      "/dashboard/business/job-orders": "Job Orders",
      "/dashboard/business/pos": "Point of Sale",
      "/dashboard/business/inventory/master-data": "Master Data",
      "/dashboard/business/inventory/stock-in": "Stock In",
      "/dashboard/business/inventory/stocks": "Stock Overview",
      "/dashboard/business/inventory/returns": "Bad Orders",
      "/dashboard/business/inventory": "Inventory",
      "/dashboard/business/products": "Products",
      "/dashboard/business/banners": "Banners",
      "/dashboard/business/flash-sales": "Flash Sales",
      "/dashboard/business/vouchers": "Vouchers",
      "/dashboard/business/sales": "Sales",
      "/dashboard/business/reports": "Reports",
      "/dashboard/business/ssa-forecast": "Sales Forecast",
      "/dashboard/business/audit-logs": "Audit Logs",
      "/dashboard/business/users": "Users",
      "/dashboard/business/role-permissions": "Role Permissions",
      ["/dashboard/business/" + "settings"]: "Settings",
    };
    return map[pathname] || "Dashboard";
  }, [pathname]);

  const sidebarRoleLabel = useMemo(() => {
    const labels = {
      admin: "Admin",
      owner: "Owner",
      salesRep: "Sales Rep",
      productionOperator: "Production",
      qualityControl: "QC Staff",
      cashier: "Cashier",
      inventoryManager: "Inventory",
    };
    return labels[currentUser?.role] ?? "Staff";
  }, [currentUser?.role]);

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

  return (
    <div className="admin-dashboard-wrapper">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Logout Confirmation Modal */}
      {logoutConfirmOpen && (
        <div
          onClick={() => setLogoutConfirmOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '400px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                Log Out
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
                Are you sure you want to log out of your account?
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setLogoutConfirmOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  background: 'transparent',
                  color: 'hsl(var(--foreground))',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'hsl(var(--destructive))',
                  color: 'hsl(var(--destructive-foreground))',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={`admin-sidebar ${sidebarOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}
      >
        <div className="admin-sidebar-inner">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon" aria-hidden="true">
                <Image
                  src="/logos/NEW logo no BG.png"
                  alt="PersonalizeMe Prints"
                  width={36}
                  height={36}
                  style={{ objectFit: "contain", display: "block" }}
                />
              </div>
              <div className="sidebar-logo-text">
                <span className="sidebar-brand-gold">PersonalizeMe</span>
                <span className="sidebar-brand-muted">Prints</span>
              </div>
              <div className="sidebar-logo-monogram" aria-hidden="true">
                <Image
                  src="/logos/NEW logo no BG.png"
                  alt="PersonalizeMe Prints"
                  width={36}
                  height={36}
                  style={{ objectFit: "contain", width: "36px", height: "36px", display: "block" }}
                />
              </div>
            </div>
            <div className="sidebar-header-actions">
              <button
                className="sidebar-close"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              >
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                } else {
                  setSidebarCollapsed((c) => !c);
                }
              }}
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {sidebarCollapsed ? (
                  <path d="M9 18l6-6-6-6" />
                ) : (
                  <path d="M15 18l-6-6 6-6" />
                )}
              </svg>
            </button>
          </div>

          <nav className="sidebar-nav">
            {navItems
              .filter((item) => {
                if (item.adminOnly && !isAdminOwner) return false;
                if (item.marketingGroup) {
                  return can("flashSales") || can("vouchers");
                }
                return can(item.permKey ?? "dashboard");
              })
              .map((item) => {
                if (item.children) {
                  const visibleChildren = item.children.filter(
                    (c) => !c.permKey || can(c.permKey),
                  );
                  const isExpanded = expandedItems.includes(item.name);
                  const hasActiveChild = isChildActive(visibleChildren);

                  return (
                    <div key={item.name} className="sidebar-nav-group">
                      <button
                        type="button"
                        className={`sidebar-nav-parent ${hasActiveChild ? "active" : ""}`}
                        onClick={() => {
                          if (sidebarCollapsed) {
                            setSidebarCollapsed(false);
                          }
                          toggleExpanded(item.name);
                        }}
                      >
                        {item.icon && (
                          <svg
                            className="nav-icon"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d={item.icon} />
                          </svg>
                        )}
                        <span className="nav-text">{item.name}</span>
                        <svg
                          className={`nav-chevron ${isExpanded ? "rotated" : ""}`}
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      <div
                        className={`sidebar-nav-children ${isExpanded ? "expanded" : ""}`}
                      >
                        {visibleChildren.map((child) => (
                          <Link
                            key={child.name}
                            href={child.href}
                            className={`sidebar-nav-child ${pathname === child.href ? "active" : ""}`}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <span className="nav-text">{child.name}</span>
                          </Link>
                        ))}
                      </div>
                      <div className="sidebar-nav-flyout">
                        <div className="sidebar-nav-flyout-title">
                          {item.name}
                        </div>
                        {visibleChildren.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`sidebar-nav-child ${pathname === child.href ? "active" : ""}`}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <span className="nav-text">{child.name}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`sidebar-nav-item ${pathname === item.href ? "active" : ""}`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon && (
                      <svg
                        className="nav-icon"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={item.icon} />
                      </svg>
                    )}
                    <span className="nav-text">{item.name}</span>
                  </Link>
                );
              })}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-avatar">
              {currentUser?.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={currentUser.avatar} alt="" />
              ) : (
                <span>{getInitials(currentUser)}</span>
              )}
            </div>
            <div className="sidebar-footer-info">
              <div className="sidebar-footer-name">
                {currentUser?.firstName && currentUser?.lastName
                  ? `${currentUser.firstName} ${currentUser.lastName}`
                  : currentUser?.email || "User"}
              </div>
              <span className="sidebar-footer-role">{sidebarRoleLabel}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div
        className={`admin-main-content${sidebarCollapsed ? " collapsed" : ""}`}
      >
        {/* Top bar */}
        <header className="admin-top-bar">
          <div className="top-bar-left">
            <button
              type="button"
              className="top-bar-hamburger"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <div className="top-bar-title">
              <span className="top-bar-page-name">{currentPageName}</span>
            </div>
          </div>
          <div className="top-bar-right">
            <div ref={notifRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="top-bar-icon-btn"
                onClick={handleOpenNotifications}
                aria-label="Notifications"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-9.33-5 6 6 0 00-2.67 5v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="top-bar-badge">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "360px",
                    maxHeight: "480px",
                    background: "var(--dark2)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    zIndex: 1000,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {/* Panel header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "1rem 1.25rem",
                      borderBottom: "1px solid var(--border)",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        color: "var(--white)",
                      }}
                    >
                      Notifications
                      {unreadCount > 0 && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            padding: "0.1rem 0.5rem",
                            background: "var(--red)",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "var(--white)",
                          }}
                        >
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--gold)",
                          fontSize: "0.78rem",
                          cursor: "pointer",
                          fontWeight: 600,
                          padding: 0,
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Panel body */}
                  <div
                    style={{
                      overflowY: "auto",
                      flex: 1,
                    }}
                  >
                    {notifLoading ? (
                      <div
                        style={{
                          padding: "2rem",
                          textAlign: "center",
                          color: "var(--gray)",
                          fontSize: "0.875rem",
                        }}
                      >
                        Marking as read...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div
                        style={{
                          padding: "2.5rem 1.25rem",
                          textAlign: "center",
                          color: "var(--gray)",
                        }}
                      >
                        <svg
                          width="40"
                          height="40"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          style={{ marginBottom: "0.75rem", opacity: 0.4 }}
                        >
                          <path
                            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3
                            9h18s-3-2-3-9"
                          />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--white)",
                            marginBottom: "0.25rem",
                          }}
                        >
                          No notifications
                        </div>
                        <div style={{ fontSize: "0.8rem" }}>
                          You are all caught up.
                        </div>
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const id = n._id || n.id;
                        return (
                          <div
                            key={id}
                            onClick={() => !n.is_read && handleMarkRead(id)}
                            style={{
                              padding: "0.875rem 1.25rem",
                              borderBottom: "1px solid rgba(255,255,255,0.05)",
                              background: n.is_read
                                ? "transparent"
                                : "rgba(212,168,67,0.06)",
                              cursor: n.is_read ? "default" : "pointer",
                              display: "flex",
                              gap: "0.75rem",
                              alignItems: "flex-start",
                              transition: "background 0.15s",
                            }}
                          >
                            {/* Unread dot */}
                            <div
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: n.is_read
                                  ? "transparent"
                                  : "var(--gold)",
                                flexShrink: 0,
                                marginTop: "5px",
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: n.is_read ? 400 : 600,
                                  fontSize: "0.875rem",
                                  color: "var(--white)",
                                  marginBottom: "0.2rem",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {n.title}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.8rem",
                                  color: "var(--gray)",
                                  lineHeight: 1.4,
                                }}
                              >
                                {n.message}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--gray)",
                                  marginTop: "0.35rem",
                                  opacity: 0.7,
                                }}
                              >
                                {new Date(n.created_at).toLocaleDateString(
                                  "en-PH",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="top-bar-divider" />
            <button
              type="button"
              className="top-bar-user"
              onClick={() => setProfileModalOpen(true)}
            >
              <div className="top-bar-avatar">
                {currentUser?.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={currentUser.avatar} alt="avatar" />
                ) : (
                  <span>{getInitials(currentUser)}</span>
                )}
              </div>
              <span className="top-bar-username">
                {currentUser?.firstName || "Admin"}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="admin-page-content">{children}</main>
      </div>

      {/* My Profile — read-only display card */}
      {profileViewOpen && (
        <div
          className="profile-modal-overlay"
          onClick={() => setProfileViewOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--dark2)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "2rem",
              width: "360px",
              maxWidth: "90vw",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
              position: "relative",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setProfileViewOpen(false)}
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                background: "transparent",
                border: "none",
                color: "var(--gray)",
                cursor: "pointer",
                fontSize: "1.2rem",
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            {/* Wait for currentUser to be populated */}
            {!currentUser ? (
              <div
                style={{
                  color: "var(--gray)",
                  fontSize: "0.875rem",
                  padding: "2rem 1rem",
                  textAlign: "center",
                }}
              >
                Loading profile...
              </div>
            ) : (
              <>
                {/* Avatar — uses profileForm which is populated when currentUser loads */}
                {currentUser?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentUser.avatar}
                    alt="avatar"
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: "var(--gold)",
                      color: "var(--black)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "2rem",
                      flexShrink: 0,
                    }}
                  >
                    {(
                      profileForm.firstName?.charAt(0) ||
                      profileForm.businessName?.charAt(0) ||
                      profileForm.email?.charAt(0) ||
                      currentUser?.email?.charAt(0) ||
                      "?"
                    )?.toUpperCase()}
                  </div>
                )}

                {/* Name and Email */}
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 600,
                      color: "var(--white)",
                    }}
                  >
                    {profileForm.firstName ||
                      profileForm.businessName ||
                      profileForm.email ||
                      currentUser?.email ||
                      "Unknown"}
                    {profileForm.firstName && profileForm.lastName
                      ? ` ${profileForm.lastName}`
                      : ""}
                  </div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--gray)",
                      marginTop: "0.25rem",
                    }}
                  >
                    {profileForm.email || currentUser?.email || ""}
                  </div>
                  {profileForm.businessType && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        fontSize: "0.8rem",
                        color: "var(--gold)",
                        background:
                          "color-mix(in srgb, var(--gold) 10%, transparent)",
                        border:
                          "1px solid color-mix(in srgb, var(--gold) 30%, transparent)",
                        borderRadius: "999px",
                        padding: "0.2rem 0.75rem",
                        display: "inline-block",
                      }}
                    >
                      {profileForm.businessType}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Profile Modal — slide-in panel */}
      {profileModalOpen && (
        <div
          className="profile-modal-overlay profile-modal-overlay--slide"
          onClick={() => {
            setProfileModalOpen(false);
            setShowAvatarFallback(false);
            setPasswordForm({
              currentPassword: "",
              newPassword: "",
              confirmPassword: "",
            });
            setPasswordError("");
            setPasswordSuccess("");
            setActiveTab("personal");
            setIsEditingProfile(false);
            setProfileSnapshot(null);
          }}
        >
          <div className="profile-modal profile-modal--slide" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="profile-modal-header">
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {currentUser?.avatar && !showAvatarFallback ? (
                    <Image
                      src={currentUser.avatar}
                      alt="avatar"
                      width={48}
                      height={48}
                      onError={() => setShowAvatarFallback(true)}
                      style={{
                        borderRadius: "50%",
                        objectFit: "cover",
                        display: "block",
                        border: "2px solid var(--gold)",
                      }}
                      unoptimized
                    />
                  ) : (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "var(--gold)",
                        color: "var(--black)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "1.2rem",
                        border: "2px solid var(--gold)",
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(currentUser)}
                    </div>
                  )}
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
                      cursor: isUploadingAvatar ? "not-allowed" : "pointer",
                      border: "2px solid var(--dark2)",
                      zIndex: 2,
                    }}
                  >
                    {isUploadingAvatar ? (
                      <span
                        className="spinner"
                        style={{ width: "10px", height: "10px" }}
                      />
                    ) : (
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
                    )}
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    disabled={isUploadingAvatar}
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>Profile</h2>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.85rem",
                      color: "var(--gray)",
                      marginTop: "0.15rem",
                    }}
                  >
                    {currentUser?.firstName && currentUser?.lastName
                      ? `${currentUser.firstName} ${currentUser.lastName}`
                      : currentUser?.email || ""}
                  </p>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: "999px",
                      border: "1px solid var(--gold)",
                      color: "var(--gold)",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginTop: "4px",
                    }}
                  >
                    {{
                      admin: "Admin",
                      owner: "Owner",
                      salesRep: "Sales Rep",
                      productionOperator: "Production",
                      qualityControl: "QC Staff",
                      cashier: "Cashier",
                      inventoryManager: "Inventory",
                    }[currentUser?.role] ?? "Staff"}
                  </span>
                </div>
              </div>
              <button
                className="profile-modal-close"
                onClick={() => {
                  setProfileModalOpen(false);
                  setShowAvatarFallback(false);
                  setPasswordForm({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                  });
                  setPasswordError("");
                  setPasswordSuccess("");
                  setActiveTab("personal");
                  setIsEditingProfile(false);
                  setProfileSnapshot(null);
                }}
              >
                ✕
              </button>
            </div>

            {/* Avatar error message */}
            {avatarError && (
              <div
                style={{
                  margin: "0 1.5rem",
                  padding: "0.5rem 0.75rem",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "8px",
                  color: "var(--red)",
                  fontSize: "0.8rem",
                }}
              >
                {avatarError}
              </div>
            )}

            {/* Avatar success message */}
            {avatarSuccess && (
              <div
                style={{
                  margin: "0 1.5rem",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  background:
                    "color-mix(in srgb, var(--green) 15%, transparent)",
                  border: "1px solid var(--green)",
                  color: "var(--green)",
                }}
              >
                Avatar updated successfully.
              </div>
            )}

            {/* Quick actions */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                padding: "0 1.25rem 1rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTab("personal");
                  setProfileSnapshot({ ...profileForm });
                  setIsEditingProfile(true);
                }}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--white)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Edit profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  handleLogout();
                }}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(239,68,68,0.25)",
                  background: "rgba(239,68,68,0.08)",
                  color: "var(--red)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Sign out
              </button>
            </div>

            {/* Tabs */}
            <div className="profile-tabs">
              <button
                className={`profile-tab ${activeTab === "personal" ? "active" : ""}`}
                onClick={() => setActiveTab("personal")}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Personal
              </button>
              <button
                className={`profile-tab ${activeTab === "security" ? "active" : ""}`}
                onClick={() => setActiveTab("security")}
              >
                <svg
                  width="18"
                  height="18"
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
            </div>

            <div className="profile-modal-body">
              {saveSuccess && (
                <div className="profile-success-message">
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
                <div className="profile-error-message">
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

              {/* Personal Info Tab */}
              {activeTab === "personal" && (
                <div>
                  {/* Section header with Edit Profile button */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "1.25rem",
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
                        type="button"
                        onClick={() => {
                          setProfileSnapshot({ ...profileForm });
                          setIsEditingProfile(true);
                        }}
                        style={{
                          padding: "0.5rem 1rem",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit Profile
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (profileSnapshot) {
                            setProfileForm(profileSnapshot);
                          }
                          setIsEditingProfile(false);
                        }}
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

                  {/* Success/Error messages */}
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

                  {/* Read-only display when NOT editing */}
                  {!isEditingProfile && (
                    <>
                      {!currentUser ? (
                        <div
                          style={{
                            color: "var(--gray)",
                            fontSize: "0.875rem",
                            padding: "0.5rem 0",
                          }}
                        >
                          Loading profile...
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "1rem",
                            marginBottom: "1rem",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--gray)",
                                marginBottom: "0.25rem",
                              }}
                            >
                              First Name
                            </div>
                            <div
                              style={{
                                fontSize: "0.95rem",
                                color: "var(--white)",
                              }}
                            >
                              {profileForm.firstName || "—"}
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--gray)",
                                marginBottom: "0.25rem",
                              }}
                            >
                              Last Name
                            </div>
                            <div
                              style={{
                                fontSize: "0.95rem",
                                color: "var(--white)",
                              }}
                            >
                              {profileForm.lastName || "—"}
                            </div>
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--gray)",
                                marginBottom: "0.25rem",
                              }}
                            >
                              Email
                            </div>
                            <div
                              style={{
                                fontSize: "0.95rem",
                                color: "var(--white)",
                              }}
                            >
                              {profileForm.email || "—"}
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--gray)",
                                marginBottom: "0.25rem",
                              }}
                            >
                              Phone
                            </div>
                            <div
                              style={{
                                fontSize: "0.95rem",
                                color: "var(--white)",
                              }}
                            >
                              {profileForm.phoneNumber || "—"}
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--gray)",
                                marginBottom: "0.25rem",
                              }}
                            >
                              Address
                            </div>
                            <div
                              style={{
                                fontSize: "0.95rem",
                                color: "var(--white)",
                              }}
                            >
                              {profileForm.address || "—"}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Editable form fields — only when editing */}
                  {isEditingProfile && (
                    <div
                      className="profile-form-grid"
                      style={{
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                        marginBottom: "1rem",
                      }}
                    >
                      <div className="profile-form-field">
                        <label>
                          First Name <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          value={profileForm.firstName}
                          onChange={(e) =>
                            handleProfileChange("firstName", e.target.value)
                          }
                          placeholder="e.g., Juan"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveProfile();
                            }
                          }}
                        />
                      </div>

                      <div className="profile-form-field">
                        <label>
                          Last Name <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          value={profileForm.lastName}
                          onChange={(e) =>
                            handleProfileChange("lastName", e.target.value)
                          }
                          placeholder="e.g., Dela Cruz"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveProfile();
                            }
                          }}
                        />
                      </div>

                      <div
                        className="profile-form-field"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <label>
                          Email Address
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
                          disabled={true}
                          readOnly={true}
                          tabIndex={-1}
                          style={{
                            opacity: 0.6,
                            cursor: "not-allowed",
                            background: "var(--dark3)",
                            userSelect: "none",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "1rem",
                        }}
                      >
                        <div className="profile-form-field">
                          <label>
                            Phone <span className="required">*</span>
                          </label>
                          <input
                            type="tel"
                            value={profileForm.phoneNumber}
                            onChange={(e) =>
                              handleProfileChange("phoneNumber", e.target.value)
                            }
                            placeholder="e.g., +63 912 345 6789"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveProfile();
                              }
                            }}
                          />
                        </div>

                        <div className="profile-form-field">
                          <label>
                            Address <span className="required">*</span>
                          </label>
                          <input
                            type="text"
                            value={profileForm.address}
                            onChange={(e) =>
                              handleProfileChange("address", e.target.value)
                            }
                            placeholder="e.g., 123 Main Street"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveProfile();
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save Changes button — only when editing */}
                  {isEditingProfile && (
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (profileSnapshot) {
                            setProfileForm(profileSnapshot);
                          }
                          setIsEditingProfile(false);
                        }}
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
                        type="button"
                        onClick={() => {
                          handleSaveProfile();
                        }}
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
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        {isSaving ? (
                          <>
                            <span className="spinner"></span>
                            Saving...
                          </>
                        ) : (
                          <>
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                              <polyline points="17 21 17 13 7 13 7 21" />
                              <polyline points="7 3 7 8 15 8" />
                            </svg>
                            Save Changes
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Business Info Tab */}
              {activeTab === "business" && (
                <div
                  className="profile-form-grid"
                  style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
                >
                  <div
                    className="profile-form-field"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <label>Business Name</label>
                    <input
                      type="text"
                      value={profileForm.businessName}
                      onChange={(e) =>
                        handleProfileChange("businessName", e.target.value)
                      }
                      placeholder="Personalize Me Prints"
                    />
                  </div>

                  <div
                    className="profile-form-field"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <label>Business Type</label>
                    <select
                      value={profileForm.businessType}
                      onChange={(e) =>
                        handleProfileChange("businessType", e.target.value)
                      }
                      style={{
                        background: "var(--dark2)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "0.75rem 0.875rem",
                        color: "var(--white)",
                        fontSize: "0.875rem",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">Select business type</option>
                      <option value="sole-proprietorship">
                        Sole Proprietorship
                      </option>
                      <option value="partnership">Partnership</option>
                      <option value="corporation">Corporation</option>
                      <option value="llc">LLC</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="profile-form-field">
                    <label>Tax ID / TIN</label>
                    <input
                      type="text"
                      value={profileForm.taxId}
                      onChange={(e) =>
                        handleProfileChange("taxId", e.target.value)
                      }
                      placeholder="000-000-000"
                      maxLength={12}
                    />
                  </div>

                  <div className="profile-form-field">
                    <label>Website</label>
                    <input
                      type="url"
                      value={profileForm.website}
                      onChange={(e) =>
                        handleProfileChange("website", e.target.value)
                      }
                      placeholder="https://yourstore.com"
                    />
                  </div>

                  <div
                    className="profile-form-field"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <label>Business Bio</label>
                    <textarea
                      value={profileForm.bio}
                      onChange={(e) =>
                        handleProfileChange("bio", e.target.value)
                      }
                      placeholder="Tell customers about your business..."
                      rows={4}
                    />
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === "security" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                    maxWidth: "500px",
                  }}
                >
                  <div
                    style={{
                      padding: "1rem",
                      background:
                        "color-mix(in srgb, var(--gold) 10%, transparent)",
                      borderRadius: "8px",
                      border:
                        "1px solid color-mix(in srgb, var(--gold) 30%, transparent)",
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
                      Your password is securely encrypted. Change it regularly
                      to keep your account safe.
                    </p>
                  </div>

                  <div className="profile-form-field">
                    <label
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--white)",
                      }}
                    >
                      Current Password{" "}
                      <span
                        className="required"
                        style={{ color: "var(--red)" }}
                      >
                        *
                      </span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPasswords.current ? "text" : "password"}
                        placeholder="Enter current password"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            currentPassword: e.target.value,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSavePassword();
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "0.75rem 0.875rem",
                          paddingRight: "3rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
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

                  <div className="profile-form-field">
                    <label
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--white)",
                      }}
                    >
                      New Password{" "}
                      <span
                        className="required"
                        style={{ color: "var(--red)" }}
                      >
                        *
                      </span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPasswords.newPass ? "text" : "password"}
                        placeholder="Enter new password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            newPassword: e.target.value,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSavePassword();
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "0.75rem 0.875rem",
                          paddingRight: "3rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
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
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  fontSize: "0.72rem",
                                  color: "inherit",
                                }}
                              >
                                {c.pass ? (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    style={{ marginRight: "0.25rem" }}
                                    aria-hidden
                                  >
                                    <path d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      width: "0.65rem",
                                      marginRight: "0.25rem",
                                      textAlign: "center",
                                      opacity: 0.45,
                                    }}
                                  >
                                    –
                                  </span>
                                )}
                              </span>
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

                  <div className="profile-form-field">
                    <label
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--white)",
                      }}
                    >
                      Confirm New Password{" "}
                      <span
                        className="required"
                        style={{ color: "var(--red)" }}
                      >
                        *
                      </span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPasswords.confirm ? "text" : "password"}
                        placeholder="Confirm new password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            confirmPassword: e.target.value,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSavePassword();
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "0.75rem 0.875rem",
                          paddingRight: "3rem",
                          background: "var(--dark)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--white)",
                          fontSize: "0.875rem",
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

                  <button
                    className="btn-primary"
                    onClick={handleSavePassword}
                    disabled={isSavingPassword}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.875rem 1.5rem",
                      background: isSavingPassword
                        ? "var(--gray)"
                        : "var(--gold)",
                      border: "none",
                      borderRadius: "8px",
                      color: isSavingPassword ? "var(--dark)" : "var(--black)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      cursor: isSavingPassword ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      width: "fit-content",
                    }}
                  >
                    {isSavingPassword ? (
                      <>
                        <span className="spinner"></span>
                        Updating...
                      </>
                    ) : (
                      <>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect
                            x="3"
                            y="11"
                            width="18"
                            height="11"
                            rx="2"
                            ry="2"
                          />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Update Password
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
