# 🚀 COMPLETE SETUP GUIDE - PersonalizeMe Prints

## 📋 **Quick Start (TL;DR)**

```bash
# 1. Backend (Terminal 1)
cd C:\PersonalizeMePrints\PersonalizeMe\backend
php artisan serve

# 2. Frontend (Terminal 2)
cd C:\PersonalizeMePrints\PersonalizeMe\frontend
npm run dev

# 3. Open browser
# Frontend: http://localhost:3000
# Backend:  http://127.0.0.1:8000
```

---

## 🗂️ **Environment Files Structure**

```
PersonalizeMe/
├── backend/
│   ├── .env              ✅ Server secrets (MongoDB, API keys) - NOT in Git
│   └── .env.example      ✅ Template with placeholders - IN Git
│
└── frontend/
    ├── .env.local        ✅ Your local config - NOT in Git
    └── .env.example      ✅ Template with placeholders - IN Git
```

---

## 🔧 **STEP-BY-STEP SETUP**

### **Part 1: Backend Setup** ✅ (Already Done!)

Your backend `.env` is already configured correctly!

**File:** `backend/.env`

**Key configurations already set:**
```env
✅ DB_CONNECTION=mongodb
✅ MONGODB_DSN=mongodb+srv://personalizeme_db_admin:***@personalizeme.atejdqr.mongodb.net/...
✅ CLOUDINARY_CLOUD_NAME=dtwzbqrdy
✅ CLOUDINARY_API_KEY=746692925734574
✅ CLOUDINARY_API_SECRET=rUoDZT-XGp_T6oHl3uzgfebUxQo
✅ APP_KEY=base64:svbITQjij8TuwNSMcP3WcBZgh1yeQO6tDTaBRJCctT4=
```

**✅ Status:** Backend is ready to go!

---

### **Part 2: Frontend Setup**

**File:** `frontend/.env.local`

**⚠️ IMPORTANT:** If `.env.local` doesn't exist, create it by copying `.env.example`:

```bash
cd C:\PersonalizeMePrints\PersonalizeMe\frontend
copy .env.example .env.local
```

**Required configuration:**
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_APP_NAME=PersonalizeMe Prints
```

**What this means:**
- `NEXT_PUBLIC_API_URL` → Tells frontend where backend is running (localhost:8000)
- `NEXT_PUBLIC_` prefix → Makes it available to the browser
- No secrets here → Safe for client-side

**✅ Status:** Frontend is ready to go!

---

## 🧪 **TESTING THE SETUP**

### **Step 1: Start Backend Server**

Open **Terminal 1** (PowerShell or CMD):

```bash
cd C:\PersonalizeMePrints\PersonalizeMe\backend
php artisan serve
```

**Expected output:**
```
   INFO  Server running on http://127.0.0.1:8000
```

**✅ Backend is running if you see this!**

---

### **Step 2: Start Frontend Server**

Open **Terminal 2** (PowerShell or CMD):

```bash
cd C:\PersonalizeMePrints\PersonalizeMe\frontend
npm run dev
```

**Expected output:**
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in xxxms
```

**✅ Frontend is running if you see this!**

---

### **Step 3: Test the Connection**

1. **Open browser** → `http://localhost:3000`

2. **Test Backend API:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - You should see no errors about API connection

3. **Test Admin Dashboard:**
   - Go to `http://localhost:3000/dashboard`
   - Login with your admin account
   - Navigate to Products page
   - **✅ Should load products from MongoDB**

4. **Test Edit Product:**
   - Click "Edit" on any product
   - Change the price or description
   - Click "Save Changes"
   - **✅ Should save to MongoDB (not localStorage)**

5. **Test Storefront:**
   - Go to `http://localhost:3000/shop`
   - **✅ Should see the updated product**

---

## 🔍 **VERIFYING EVERYTHING WORKS**

### **Checklist:**

- [ ] Backend server running at `http://127.0.0.1:8000`
- [ ] Frontend server running at `http://localhost:3000`
- [ ] Can access landing page
- [ ] Can login to admin dashboard
- [ ] Products load in admin dashboard
- [ ] Can edit a product and save
- [ ] Edited product appears in storefront
- [ ] No console errors (F12 → Console)

---

## 🐛 **TROUBLESHOOTING**

### **Problem: "Cannot connect to backend"**

**Check:**
1. Backend is running: `http://127.0.0.1:8000`
2. `.env.local` has correct URL: `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`
3. Restart frontend after changing `.env.local`

**Fix:**
```bash
# Restart frontend
cd C:\PersonalizeMePrints\PersonalizeMe\frontend
npm run dev
```

---

### **Problem: "MongoDB connection error"**

**Check:**
1. MongoDB credentials in `backend/.env`
2. Internet connection (for MongoDB Atlas)
3. MongoDB cluster is running

**Fix:**
```bash
# Test MongoDB connection
cd C:\PersonalizeMePrints\PersonalizeMe\backend
php artisan tinker
>>> App\Models\Product::count()
# Should return number of products
```

---

### **Problem: "401 Unauthorized"**

**Check:**
1. You're logged in as admin
2. Token is in localStorage: `localStorage.getItem('auth_token')`

**Fix:**
1. Logout and login again
2. Make sure user has admin/owner role in database

---

### **Problem: "Products not appearing in storefront"**

**Check:**
1. Product is published (`isPublished: true`)
2. Product is active (`isActive: true`)
3. Clear browser cache (Ctrl+Shift+R)

**Fix:**
1. Go to admin dashboard → Products
2. Make sure product status is "Published"
3. Refresh storefront page

---

## 📊 **DATA FLOW DIAGRAM**

```
┌──────────────────────────────────────────────────────────────┐
│                      USER ACTIONS                             │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                          │
│              http://localhost:3000                            │
│                                                               │
│  Admin Dashboard ←→ API Calls (.env.local config)            │
│  Storefront      ←→ API Calls                                 │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP Requests
                            │ Authorization: Bearer <token>
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   BACKEND (Laravel)                           │
│              http://127.0.0.1:8000                            │
│                                                               │
│  API Routes → Controllers → Models                           │
│  (.env config for DB, API keys)                              │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ MongoDB Driver
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                  DATABASE (MongoDB Atlas)                     │
│         personalizeme.atejdqr.mongodb.net                     │
│                                                               │
│  Collections:                                                 │
│  - users                                                      │
│  - products                                                   │
│  - inventory                                                  │
│  - orders                                                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔐 **SECURITY NOTES**

### **What's in each .env file:**

#### **Backend `.env`** (SECRET - Never expose!)
```env
❌ DB_PASSWORD=personalizeMeforProject
❌ CLOUDINARY_API_SECRET=***
❌ APP_KEY=***
❌ MAIL_PASSWORD=***
```

#### **Frontend `.env.local`** (PUBLIC - OK for browser)
```env
✅ NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
✅ NEXT_PUBLIC_APP_NAME=PersonalizeMe Prints
```

**Rule of thumb:**
- Backend `.env` → Contains secrets (passwords, API keys)
- Frontend `.env.local` → Contains public config (URLs, names)
- **Never** put backend secrets in frontend `.env.local`!

---

## 📝 **QUICK REFERENCE**

| Component | URL | Config File |
|-----------|-----|-------------|
| Backend | `http://127.0.0.1:8000` | `backend/.env` |
| Frontend | `http://localhost:3000` | `frontend/.env.local` |
| MongoDB | Atlas Cloud | `backend/.env` (DB_URI) |
| Cloudinary | Cloud | `backend/.env` (CLOUDINARY_*) |

---

## ✅ **FINAL CHECKLIST**

Before you start developing:

- [ ] Backend `.env` exists with correct MongoDB credentials
- [ ] Backend `.env` has Cloudinary credentials
- [ ] Frontend `.env.local` exists
- [ ] Frontend `.env.local` has `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`
- [ ] Backend server running (`php artisan serve`)
- [ ] Frontend server running (`npm run dev`)
- [ ] Can access `http://localhost:3000`
- [ ] Can login to admin dashboard
- [ ] Can edit product and see changes in storefront

---

## 🎯 **SUMMARY**

**Your setup is already complete!** ✅

Both backend and frontend `.env` files are configured correctly.

**To run the app:**
1. Start backend: `php artisan serve`
2. Start frontend: `npm run dev`
3. Open: `http://localhost:3000`

**The connection works because:**
- Frontend `.env.local` → Points to `http://127.0.0.1:8000`
- Backend `.env` → Connected to MongoDB Atlas
- API endpoints → Properly configured in Laravel routes

**You're all set! 🚀**
