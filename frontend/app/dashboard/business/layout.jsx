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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useTheme } from "../../../contexts/ThemeContext";
import "./admin-dashboard.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// Roles allowed into the /dashboard/business/* admin area. This layout wraps EVERY admin page,
// so this single allowlist guards the whole dashboard at once. Anyone else — customers, guests,
// or any unknown/future role — is redirected out. (Data is independently protected server-side.)
const STAFF_ROLES = ['superAdmin', 'admin', 'owner', 'salesRep', 'productionOperator', 'qualityControl', 'cashier', 'inventoryManager'];

// A user belongs in the business dashboard if they are any authenticated
// non-customer role. Per-module access is enforced by the backend and reflected
// by can(); this guard only separates staff from customers/guests — so new roles
// (administrator, manager, salesStaff, productionStaff, financeStaff, and any
// future custom role) work without editing a hard-coded list.
const isStaffRole = (role) => typeof role === 'string' && role !== '' && role !== 'customer';

export default function BusinessDashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
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
  const [selectedNotif, setSelectedNotif] = useState(null);
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
    // Route guard for the whole /dashboard/business/* admin area (this layout wraps every admin
    // page). AuthContext resolves before this renders, so currentUser is the user or null (guest).
    if (!currentUser) {
      router.replace("/");         // guest / not logged in → landing + login
      return;
    }
    if (!isStaffRole(currentUser.role)) {
      router.replace("/shop");     // customer or any non-staff role → storefront
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
      const token = localStorage.getItem("auth_token");

      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetchWithTimeout(`${API_URL}/api/profile/upload-avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }, 30000);

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
      const token = localStorage.getItem("auth_token");
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
    const pw = passwordForm.newPassword;
    if (pw.length < 8)                       { setPasswordError("New password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(pw))                   { setPasswordError("New password must contain at least one uppercase letter."); return; }
    if (!/[a-z]/.test(pw))                   { setPasswordError("New password must contain at least one lowercase letter."); return; }
    if (!/\d/.test(pw))                      { setPasswordError("New password must contain at least one number."); return; }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) { setPasswordError("New password must contain at least one special character."); return; }
    if (pw !== passwordForm.confirmPassword) { setPasswordError("Passwords do not match."); return; }

    setIsSavingPassword(true);
    try {
      const token = localStorage.getItem("auth_token");
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

  // Reverb/Echo â€” real-time order status updates on admin channel
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
      // Echo/Reverb not reachable â€” silently ignore (HTTP polling still covers it)
    }

    return () => {
      disconnectEcho();
    };
  }, [token]);

  // Suppress DOM-Event unhandled rejections and errors (Pusher/WebSocket internals)
  useEffect(() => {
    const rejectionHandler = (e) => {
      if (e.reason instanceof Event || String(e.reason) === '[object Event]') e.preventDefault();
    };
    const errorHandler = (e) => {
      if (e.error instanceof Event || String(e.message) === '[object Event]') {
        e.preventDefault();
        return true;
      }
    };
    window.addEventListener('unhandledrejection', rejectionHandler);
    window.addEventListener('error', errorHandler, true);
    return () => {
      window.removeEventListener('unhandledrejection', rejectionHandler);
      window.removeEventListener('error', errorHandler, true);
    };
  }, []);

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


  const permsCacheRef = useRef(null);
  // Super Admin access mode, surfaced from /my/permissions: { isSuperAdmin, fullAccess }.
  // fullAccess reflects the backend SUPERADMIN_FULL_ACCESS env toggle.
  const [superAccess, setSuperAccess] = useState(null);

  // Fetch role permissions on mount
  useEffect(() => {
    if (!token) return;
    if (permsCacheRef.current?.token === token) {
      setPermissions(permsCacheRef.current.permissions);
      setSuperAccess(permsCacheRef.current.superAccess ?? null);
      return;
    }
    fetchWithTimeout(`${API_URL}/api/my/permissions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "ngrok-skip-browser-warning": "1",
      },
    }, 15000)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data?.permissions) {
          const access = {
            isSuperAdmin: !!data.data.is_super_admin,
            fullAccess: data.data.full_access,
          };
          permsCacheRef.current = {
            token,
            permissions: data.data.permissions,
            superAccess: access,
          };
          setPermissions(data.data.permissions);
          setSuperAccess(access);
        }
      })
      .catch(() => {}); // non-fatal â€” sidebar degrades gracefully
  }, [token]);

  // Owner has full business access. Super Admin (superAdmin/legacy admin) is
  // governed by the backend access toggle, surfaced via /my/permissions — so
  // scoped mode hides business modules here too. Everyone else follows their grid.
  const SUPER_ROLES = ["superAdmin", "admin"];
  // Mirror of backend App\Support\Rbac::gridAllows — bridges coarse module flags
  // and fine module.action keys so can('orders') and can('orders.edit') both work.
  const gridAllows = (perms, key) => {
    if (!perms) return false;
    if (key.includes(".")) {
      if (key in perms) return perms[key] === true;
      const mod = key.split(".")[0];
      for (const k in perms) if (k.startsWith(mod + ".")) return false;
      return perms[mod] === true;
    }
    if (perms[key] === true) return true;
    const prefix = key + ".";
    for (const k in perms) if (k.startsWith(prefix) && perms[k] === true) return true;
    return false;
  };
  const can = (key) => {
    if (!currentUser) return false;
    if (currentUser.role === "owner") return true;
    // Super Admin: optimistic until perms load (avoids nav flash); then the
    // fetched map governs, so the access toggle / scoped mode is honored.
    if (SUPER_ROLES.includes(currentUser.role) && !permissions) return true;
    return gridAllows(permissions, key);
  };
  const isAdminOwner = ["superAdmin", "admin", "owner"].includes(currentUser?.role);
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard/business/dashboardoverview",
      permKey: "dashboard",
      icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
    },
    // The replacement, carried alongside the original rather than swapped in, so the two can be
    // compared on real data before anything is removed. Same permission key - it is the same
    // page's job, done differently.
    {
      name: "Home (new)",
      href: "/dashboard/business/home",
      permKey: "dashboard",
      icon: "M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM13 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zM13 14a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z",
    },
    { type: "divider", label: "Operations" },
    {
      name: "Orders",
      href: "/dashboard/business/orders",
      permKey: "orders",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    },
    {
      name: "POS",
      href: "/dashboard/business/pos",
      permKey: "pos",
      icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    },
    {
      name: "Job Orders",
      href: "/dashboard/business/job-orders",
      permKey: "production",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    },
    { type: "divider", label: "Production" },
    {
      name: "Production",
      href: "/dashboard/business/production-preview",
      permKey: "production",
      icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    },
    {
      name: "Quality Control",
      href: "/dashboard/business/qc-preview",
      permKey: "qc",
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    { type: "divider", label: "Inventory" },
    {
      name: "Master Data",
      href: "/dashboard/business/inventory-v2?tab=materials",
      permKey: "inventory",
      matchTabs: ["materials", "vendors", "bom"],
      icon: "M4 7c0-1.1 3.6-2 8-2s8 .9 8 2v2c0 1.1-3.6 2-8 2s-8-.9-8-2V7zm0 6c0 1.1 3.6 2 8 2s8-.9 8-2m-16 0v4c0 1.1 3.6 2 8 2s8-.9 8-2v-4",
    },
    {
      name: "Overview",
      href: "/dashboard/business/inventory-v2?tab=productstock",
      permKey: "inventory",
      matchTabs: ["productstock", "stockin", "goods", "actual"],
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
    {
      name: "To Buy",
      href: "/dashboard/business/to-buy",
      permKey: "inventory",
      icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3A1 1 0 005.4 17H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    },
    {
      name: "Bad Orders",
      href: "/dashboard/business/inventory-v2?tab=badorders",
      permKey: "inventory",
      matchTabs: ["badorders"],
      icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    { type: "divider", label: "Products" },
    {
      name: "Catalog",
      href: "/dashboard/business/products-v2",
      permKey: "products",
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    },
    {
      name: "Collections",
      href: "/dashboard/business/collections",
      permKey: "products",
      icon: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
    },
    {
      name: "Banners",
      href: "/dashboard/business/banners",
      permKey: "products",
      icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    },
    {
      name: "Homepage",
      href: "/dashboard/business/homepage",
      permKey: "products",
      icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    },
    {
      name: "Reviews",
      href: "/dashboard/business/reviews",
      permKey: "products",
      icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
    },
    {
      name: "Promotions",
      href: "/dashboard/business/promotions",
      permKey: "flashSales",
      marketingGroup: true,
      icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
    },
    { type: "divider", label: "Finance" },
    {
      name: "Sales",
      href: "/dashboard/business/sales",
      permKey: "sales",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
    {
      name: "Payments",
      href: "/dashboard/business/payments",
      permKey: "sales",
      adminOnly: true,
      icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    },
    {
      name: "Reports",
      href: "/dashboard/business/reports",
      permKey: "sales",
      icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      name: "Forecast",
      href: "/dashboard/business/ssa-forecast",
      permKey: "sales",
      icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z",
    },
    { type: "divider", label: "Users" },
    {
      name: "Staff",
      href: "/dashboard/business/users",
      permKey: "userManagement",
      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    },
    {
      name: "Customers",
      href: "/dashboard/business/customers",
      permKey: "userManagement",
      icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z",
    },
    {
      name: "Permissions",
      href: "/dashboard/business/role-permissions",
      permKey: "userManagement",
      icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    },
    { type: "divider", label: "Admin" },
    {
      name: "Messages",
      href: "/dashboard/business/chat",
      permKey: "dashboard",
      icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
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
  ];


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
      "/dashboard/business/home": "Home",
      "/dashboard/business/orders": "Orders",
      "/dashboard/business/job-orders": "Job Orders",
      "/dashboard/business/pos": "Point of Sale",
      "/dashboard/business/inventory-v2": "Inventory",
      "/dashboard/business/products-v2": "Catalog",
      "/dashboard/business/collections": "Collections",
      "/dashboard/business/banners": "Banners",
      "/dashboard/business/homepage": "Homepage",
      "/dashboard/business/reviews": "Reviews",
      "/dashboard/business/promotions": "Promotions",
      "/dashboard/business/production-preview": "Production",
      "/dashboard/business/qc-preview": "Quality Control",
      "/dashboard/business/sales": "Sales",
      "/dashboard/business/payments": "Payments",
      "/dashboard/business/reports": "Reports",
      "/dashboard/business/ssa-forecast": "Sales Forecast",
      "/dashboard/business/chat": "Messages",
      "/dashboard/business/audit-logs": "Audit Logs",
      "/dashboard/business/users": "Staff",
      "/dashboard/business/customers": "Customers",
      "/dashboard/business/to-buy": "To Buy",
      "/dashboard/business/role-permissions": "Permissions",
      "/dashboard/business/settings": "Settings",
    };
    const tabMap = {
      materials: "Master Data", vendors: "Master Data", bom: "Master Data",
      productstock: "Overview", stockin: "Overview", goods: "Overview", actual: "Overview",
      badorders: "Bad Orders",
    };
    if (currentTab && tabMap[currentTab]) return tabMap[currentTab];
    return map[pathname] || "Dashboard";
  }, [pathname, currentTab]);

  const sidebarRoleLabel = useMemo(() => {
    const labels = {
      superAdmin: "Super Admin",
      admin: "Super Admin",
      owner: "Owner",
      administrator: "Administrator",
      manager: "Manager",
      salesStaff: "Sales Staff",
      productionStaff: "Production Staff",
      inventoryStaff: "Inventory Staff",
      financeStaff: "Finance Staff",
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

  // Never paint the admin shell for anyone unauthorized — the guard above redirects them.
  // This runs after all hooks, so hook order stays stable.
  if (!currentUser || !isStaffRole(currentUser.role)) {
    return null;
  }

  return (
    <div className="admin-dashboard-wrapper">
      <style>{`@keyframes shimmer{0%,100%{background-position:-400px 0}100%{background-position:400px 0}}`}</style>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Notification Detail Modal */}
      {selectedNotif && (
        <div
          onClick={() => setSelectedNotif(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              width: '100%', maxWidth: '460px',
              padding: '1.75rem',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--white)', lineHeight: 1.4 }}>
                {selectedNotif.title}
              </h3>
              <button
                onClick={() => setSelectedNotif(null)}
                style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: 0, flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--gray)', lineHeight: 1.6 }}>
              {selectedNotif.message}
            </p>
            {selectedNotif.data?.orderId && (
              <a
                href={`/dashboard/business/orders`}
                style={{ fontSize: '0.8rem', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}
                onClick={() => setSelectedNotif(null)}
              >
                View Order â†’
              </a>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)', opacity: 0.6, marginTop: '0.25rem' }}>
              {new Date(selectedNotif.created_at).toLocaleString('en-PH', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
            <button
              onClick={() => setSelectedNotif(null)}
              style={{
                marginTop: '0.25rem', padding: '0.6rem',
                background: 'var(--dark3)',
                border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--white)',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
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
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '2rem',
              width: '100%',
              maxWidth: '400px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--white)', margin: 0 }}>
                Log Out
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--gray)', margin: 0, lineHeight: 1.5 }}>
                Are you sure you want to log out of your account?
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setLogoutConfirmOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--gray)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
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
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: 700,
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
                  src="/logos/PersonalizeMe logo.png"
                  alt="PersonalizeMe Prints"
                  width={40}
                  height={40}
                  style={{ objectFit: "cover", borderRadius: "50%", display: "block" }}
                />
              </div>
              <div className="sidebar-logo-text">
                PERSONALIZE <span>ME</span><br />PRINTS
              </div>
              <div className="sidebar-logo-monogram" aria-hidden="true">
                <Image
                  src="/logos/PersonalizeMe logo.png"
                  alt="PersonalizeMe Prints"
                  width={36}
                  height={36}
                  style={{ objectFit: "cover", borderRadius: "50%", width: "36px", height: "36px", display: "block" }}
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
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                if (item.type === "divider") return true;
                if (item.adminOnly && !isAdminOwner) return false;
                return true;
              })
              .map((item) => {
                if (item.type === "divider") {
                  return (
                    <div key={`divider-${item.label}`} className="sidebar-divider-label">
                      {item.label}
                    </div>
                  );
                }

                const navIcon = item.icon ? (
                  <svg className="nav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                ) : null;

                const lockIcon = (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.6 }}>
                    <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                );

                const isAccessible = isAdminOwner || (
                  item.marketingGroup
                    ? (can("flashSales") || can("vouchers"))
                    : can(item.permKey ?? "dashboard")
                );

                if (!isAccessible) {
                  return (
                    <div key={item.name} className="sidebar-nav-item" style={{ opacity: 0.4, cursor: "not-allowed", display: "flex", alignItems: "center" }}>
                      {navIcon}
                      <span className="nav-text">{item.name}</span>
                      {lockIcon}
                    </div>
                  );
                }

                const fullHref = pathname + (currentTab ? `?tab=${currentTab}` : '');
                const isActive = (item.matchTabs && currentTab && item.matchTabs.includes(currentTab))
                  || pathname === item.href
                  || fullHref === item.href;

                return (
                  <Link key={item.name} href={item.href} className={`sidebar-nav-item ${isActive ? "active" : ""}`} onClick={() => setSidebarOpen(false)}>
                    {navIcon}
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
              {superAccess?.isSuperAdmin && (
                <span
                  title={
                    superAccess.fullAccess
                      ? "Full Access — Super Admin bypasses all permission checks (SUPERADMIN_FULL_ACCESS=true). Development mode."
                      : "Scoped — Super Admin is limited to system tasks (users, roles, audit, settings). Set SUPERADMIN_FULL_ACCESS=true to restore full access."
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    marginTop: "3px",
                    padding: "1px 7px",
                    borderRadius: "999px",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    cursor: "help",
                    color: superAccess.fullAccess ? "#4ade80" : "#fbbf24",
                    background: superAccess.fullAccess ? "rgba(74,222,128,0.12)" : "rgba(251,191,36,0.12)",
                    border: `1px solid ${superAccess.fullAccess ? "rgba(74,222,128,0.35)" : "rgba(251,191,36,0.35)"}`,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "currentColor",
                    }}
                  />
                  {superAccess.fullAccess ? "Full Access" : "Scoped"}
                </span>
              )}
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
            {/* Theme toggle */}
            <button
              type="button"
              className="top-bar-icon-btn"
              onClick={toggleTheme}
              aria-label="Toggle light/dark mode"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
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
                    background: "#ffffff",
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: "12px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
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
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        color: "#111",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      Notifications
                      {unreadCount > 0 && (
                        <span
                          style={{
                            padding: "0.1rem 0.5rem",
                            background: "#ef4444",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#fff",
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
                          color: "#d4a843",
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

                  {/* Panel body. The scrollbar used to be hidden outright, so a list of 59
                      notifications gave the reader no sign there was anything below the fold. */}
                  <div
                    style={{
                      overflowY: "auto",
                      flex: 1,
                    }}
                  >
                    {notifLoading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        {[...Array(4)].map((_, i) => (
                          <div key={i} style={{ padding: "1rem 1.25rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)", backgroundSize: "400px 100%", animation: "shimmer 1.4s ease-in-out infinite", flexShrink: 0 }} />
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                              <div style={{ height: "13px", borderRadius: "4px", background: "linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)", backgroundSize: "400px 100%", animation: "shimmer 1.4s ease-in-out infinite", width: "75%" }} />
                              <div style={{ height: "11px", borderRadius: "4px", background: "linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)", backgroundSize: "400px 100%", animation: "shimmer 1.4s ease-in-out infinite", width: "50%" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : notifications.length === 0 ? (
                      <div
                        style={{
                          padding: "2.5rem 1.25rem",
                          textAlign: "center",
                          color: "#888",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <svg
                          width="40"
                          height="40"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          style={{ marginBottom: "0.75rem", opacity: 0.35 }}
                        >
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        <div style={{ fontWeight: 600, color: "#333", marginBottom: "0.25rem" }}>
                          No notifications
                        </div>
                        <div style={{ fontSize: "0.8rem" }}>
                          You are all caught up.
                        </div>
                      </div>
                    ) : (
                      notifications.map((n, i) => {
                        const id = n._id ?? n.id ?? String(i);
                        return (
                          <div
                            key={id}
                            onClick={() => {
                              if (!n.is_read) handleMarkRead(id);
                              setSelectedNotif(n);
                              setNotifOpen(false);
                            }}
                            style={{
                              padding: "0.875rem 1.25rem",
                              borderBottom: "1px solid rgba(0,0,0,0.06)",
                              background: n.is_read ? "transparent" : "rgba(212,168,67,0.07)",
                              cursor: "pointer",
                              display: "flex",
                              gap: "0.75rem",
                              alignItems: "flex-start",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={e => { if (!n.is_read) e.currentTarget.style.background = "rgba(212,168,67,0.12)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = n.is_read ? "transparent" : "rgba(212,168,67,0.07)"; }}
                          >
                            <div
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: n.is_read ? "transparent" : "#d4a843",
                                flexShrink: 0,
                                marginTop: "5px",
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: n.is_read ? 400 : 600,
                                  fontSize: "0.875rem",
                                  color: "#222",
                                  marginBottom: "0.2rem",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {n.title}
                              </div>
                              <div style={{ fontSize: "0.8rem", color: "#555", lineHeight: 1.4 }}>
                                {n.message}
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "#888", marginTop: "0.35rem" }}>
                                {new Date(n.created_at).toLocaleDateString("en-PH", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
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

      {/* My Profile â€” read-only display card */}
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
              âœ•
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
                {/* Avatar â€” uses profileForm which is populated when currentUser loads */}
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
          onClick={() => { setProfileModalOpen(false); setShowAvatarFallback(false); }}
        >
          <div className="profile-modal profile-modal--slide" onClick={(e) => e.stopPropagation()}>

            {/* ── Close button ── */}
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "0.75rem 0.875rem 0" }}>
              <button
                className="profile-modal-close"
                style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--dark2)", fontSize: "1rem" }}
                onClick={() => { setProfileModalOpen(false); setShowAvatarFallback(false); }}
              >
                ✕
              </button>
            </div>

            {/* ── Hero: avatar + name + role ── */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "1rem 1.5rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ position: "relative", marginBottom: "0.875rem" }}>
                {currentUser?.avatar && !showAvatarFallback ? (
                  <Image
                    src={currentUser.avatar}
                    alt="avatar"
                    width={76}
                    height={76}
                    onError={() => setShowAvatarFallback(true)}
                    style={{ borderRadius: "50%", objectFit: "cover", display: "block", border: "2px solid var(--gold)" }}
                    unoptimized
                  />
                ) : (
                  <div style={{ width: "76px", height: "76px", borderRadius: "50%", background: "var(--gold)", color: "var(--black)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.7rem", border: "2px solid var(--gold)" }}>
                    {getInitials(currentUser)}
                  </div>
                )}
              </div>

              <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--white)", textAlign: "center", lineHeight: 1.3 }}>
                {currentUser?.firstName && currentUser?.lastName
                  ? `${currentUser.firstName} ${currentUser.lastName}`
                  : currentUser?.email || "—"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--gray)", marginTop: "0.2rem", textAlign: "center" }}>
                {currentUser?.email || ""}
              </div>
              <span style={{ display: "inline-block", marginTop: "0.6rem", padding: "2px 10px", borderRadius: "999px", border: "1px solid var(--gold)", color: "var(--gold)", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {{ superAdmin: "Super Admin", admin: "Super Admin", owner: "Owner", administrator: "Administrator", manager: "Manager", salesStaff: "Sales Staff", productionStaff: "Production Staff", inventoryStaff: "Inventory Staff", financeStaff: "Finance Staff", salesRep: "Sales Rep", productionOperator: "Production", qualityControl: "QC Staff", cashier: "Cashier", inventoryManager: "Inventory" }[currentUser?.role] ?? "Staff"}
              </span>
            </div>

            <div className="profile-modal-body">
              <div>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "0.25rem" }}>
                  Account Details
                </span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {[
                    { label: "Full Name", value: [profileForm.firstName, profileForm.lastName].filter(Boolean).join(" ") || "—" },
                    { label: "Email", value: profileForm.email || "—" },
                    { label: "Phone", value: profileForm.phoneNumber || "—" },
                    { label: "Address", value: profileForm.address || "—" },
                  ].map((row, i, arr) => (
                    <div key={row.label} style={{ display: "flex", flexDirection: "column", padding: "0.75rem 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>{row.label}</span>
                      <span style={{ fontSize: "0.875rem", color: "var(--white)", wordBreak: "break-word" }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: "1.25rem" }}>
                <Link
                  href="/dashboard/business/settings"
                  onClick={() => setProfileModalOpen(false)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--dark2)", color: "var(--white)", fontSize: "0.8125rem", fontWeight: 600, textDecoration: "none" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  Manage Settings
                </Link>
              </div>
            </div>

            {/* ── Sign Out footer ── */}
            <div style={{ padding: "0.875rem 1.25rem", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => { setProfileModalOpen(false); handleLogout(); }}
                style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "var(--red)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
