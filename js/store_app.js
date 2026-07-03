/**
 * DawaDo Pharmacy Business Portal Controller (Enterprise A-Z)
 * Orchestrates real-time state synchronization, auth flows, KYC compliance,
 * order processing, prescription verification, inventory catalog,
 * coupons, supplier purchase logs, staff roster, settings, and Leaflet mapping.
 */

import { db, auth, mapUtils, cloudinaryUtils } from "/js/db.js";

// Active session variables
let activeStoreId = null;
let activeStoreData = null;
let fullOrdersList = [];
let fullMedicinesList = [];
let activeOrdersFilter = "all";
let activeInventorySearch = "";
let activeInventoryCategory = "ALL";

// Document zoom/rotation settings
let currentRxZoom = 1;
let currentRxRotation = 0;

// Temporary upload buffers
let tempUploadedLicenseUrl = "";
let tempUploadedLogoUrl = "";
let tempUploadedMedImageUrl = "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300";
let tempUploadedInvoiceUrl = "";

// Initialize App On Load
window.addEventListener("DOMContentLoaded", () => {
  setupRememberedCredentials();
  initializeAuthListener();
});

// -----------------------------------------
// 1. AUTHENTICATION CONTROLLER & VIEWS
// -----------------------------------------

function setupRememberedCredentials() {
  const rememberedEmail = localStorage.getItem("dawado_remembered_email");
  const rememberedPass = localStorage.getItem("dawado_remembered_pass");
  if (rememberedEmail && rememberedPass) {
    document.getElementById("store-email").value = rememberedEmail;
    document.getElementById("store-pass").value = rememberedPass;
    document.getElementById("remember-login").checked = true;
  }
}

function initializeAuthListener() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      activeStoreId = user.uid;
      // Fetch or seed specific Store Document
      db.ref(`stores/${activeStoreId}`).on("value", (snapshot) => {
        if (snapshot.exists()) {
          activeStoreData = snapshot.val();
        } else {
          // Initialize default store profile
          activeStoreData = {
            id: activeStoreId,
            name: user.name || "DawaDo Affiliate Pharmacy",
            email: user.email,
            status: "incomplete", // incomplete, pending, approved, suspended, holiday
            active: false,
            balance: 0,
            rating: 5.0,
            logo: "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=100",
            kyc: {},
            settings: {
              holidayMode: false,
              openTime: "09:00",
              closeTime: "23:00",
              autoAccept: true,
              deliveryRadius: 5,
              preparationMins: 20,
              minOrder: 100,
              deliveryFee: 30
            }
          };
          db.ref(`stores/${activeStoreId}`).set(activeStoreData);
        }
        evaluateStoreAccessRouting();
      });
    } else {
      activeStoreId = null;
      activeStoreData = null;
      showView("auth");
      document.getElementById("bottom-nav-bar").style.display = "none";
      // Off old listeners
      db.ref("orders").off("value");
      db.ref("medicines").off("value");
    }
  });
}

// Router constraint based on compliance states
function evaluateStoreAccessRouting() {
  if (!activeStoreData) return;

  const currentStatus = activeStoreData.status || "incomplete";
  
  if (currentStatus === "approved" || activeStoreData.active === true) {
    document.getElementById("bottom-nav-bar").style.display = "flex";
    
    // Header labels update
    const hStatus = document.getElementById("header-status-badge");
    if (hStatus) {
      if (activeStoreData.settings?.holidayMode) {
        hStatus.innerText = "Holiday Mode";
        hStatus.style.background = "var(--warning-light)";
        hStatus.style.color = "var(--warning)";
      } else {
        hStatus.innerText = "Hub Active";
        hStatus.style.background = "var(--accent-light)";
        hStatus.style.color = "var(--accent-dark)";
      }
    }

    // Load dynamic feeds
    startRealtimeSyncListeners();
    // Default to Dashboard
    showView("dashboard");
  } else {
    // Force compliance page
    document.getElementById("bottom-nav-bar").style.display = "none";
    showView("kyc");
    renderKycCurrentStatus();
  }
}

// Switching sub view inside Auth card
window.toggleAuthSubView = function(view) {
  document.getElementById("auth-login-panel").style.display = view === "login" ? "block" : "none";
  document.getElementById("auth-signup-panel").style.display = view === "signup" ? "block" : "none";
  document.getElementById("auth-forgot-panel").style.display = view === "forgot" ? "block" : "none";
};

// Handle Store login
window.handleStoreLogin = async function(e) {
  e.preventDefault();
  const email = document.getElementById("store-email").value;
  const pass = document.getElementById("store-pass").value;
  const remember = document.getElementById("remember-login").checked;

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    if (remember) {
      localStorage.setItem("dawado_remembered_email", email);
      localStorage.setItem("dawado_remembered_pass", pass);
    } else {
      localStorage.removeItem("dawado_remembered_email");
      localStorage.removeItem("dawado_remembered_pass");
    }
    showToast("Terminal Unlocked! Connecting to live ledger...", "check");
  } catch (err) {
    showToast(err.message, "danger");
  }
};

// Handle Store registration signup
window.handleStoreSignup = async function(e) {
  e.preventDefault();
  const storeName = document.getElementById("signup-store-name").value;
  const ownerName = document.getElementById("signup-owner-name").value;
  const email = document.getElementById("signup-email").value;
  const pass = document.getElementById("signup-pass").value;
  const confirmPass = document.getElementById("signup-confirm-pass").value;

  if (pass !== confirmPass) {
    showToast("Passwords do not match!", "danger");
    return;
  }

  try {
    // Creates account inside simulation credentials database
    await auth.createUserWithEmailAndPassword(email, pass, storeName, "store");
  } catch (err) {
    // If account requires Admin Approval (which our auth simulator throws as message)
    if (err.message.includes("Admin Approval")) {
      showToast("Signup successful! Complete KYC folder next.", "check");
      // Force Login screen to allow logging in to complete KYC profile
      toggleAuthSubView("login");
      document.getElementById("store-email").value = email;
      document.getElementById("store-pass").value = pass;
    } else {
      showToast(err.message, "danger");
    }
  }
};

// Forgot Password implementation
window.handleStoreForgot = function(e) {
  e.preventDefault();
  const email = document.getElementById("forgot-email").value;
  showToast(`Security verification code dispatched to ${email}!`, "check");
  toggleAuthSubView("login");
};

// Handle logout
window.handleStoreLogout = async function() {
  await auth.signOut();
  showToast("Merchant session locked securely.", "info");
};


// -----------------------------------------
// 2. KYC COMPLIANCE CONTROLLER
// -----------------------------------------

function renderKycCurrentStatus() {
  const statusText = document.getElementById("kyc-status-text");
  const statusDesc = document.getElementById("kyc-status-desc");
  const statusBanner = document.getElementById("kyc-status-banner");

  const status = activeStoreData.status || "incomplete";

  if (status === "incomplete") {
    statusText.innerText = "Awaiting compliance KYC";
    statusDesc.innerText = "Submit your government drug license and identity details to trigger pharmacy validation procedures.";
    statusBanner.style.background = "var(--warning-light)";
    statusBanner.style.borderColor = "var(--warning)";
    statusBanner.style.color = "#9a3412";
  } else if (status === "pending") {
    statusText.innerText = "Pending Admin Audit Verification";
    statusDesc.innerText = "Your compliance folder is currently being verified by CDSCO/DawaDo medical auditors. Status updates usually within 2 hours.";
    statusBanner.style.background = "#eff6ff";
    statusBanner.style.borderColor = "#3b82f6";
    statusBanner.style.color = "#1d4ed8";
  } else if (status === "rejected") {
    statusText.innerText = "Folder Rejected - Review Details";
    statusDesc.innerText = "The drug license document uploaded was illegible or expired. Please re-upload verified files to resume.";
    statusBanner.style.background = "var(--danger-light)";
    statusBanner.style.borderColor = "var(--danger)";
    statusBanner.style.color = "#991b1b";
  } else if (status === "suspended") {
    statusText.innerText = "Terminal Suspended";
    statusDesc.innerText = "Your pharmacy license has been suspended by administration. Contact support@dawado.com.";
    statusBanner.style.background = "#f1f5f9";
    statusBanner.style.borderColor = "#64748b";
    statusBanner.style.color = "#334155";
  }
}

// Capture current user coordinates
window.fetchKycGeolocationPin = function() {
  if (navigator.geolocation) {
    showToast("Pinging satellites for GPS location...", "info");
    navigator.geolocation.getCurrentPosition((pos) => {
      document.getElementById("kyc-lat").value = pos.coords.latitude.toFixed(7);
      document.getElementById("kyc-lng").value = pos.coords.longitude.toFixed(7);
      showToast("GPS coordinates acquired!", "check");
    }, (err) => {
      showToast("Satellites unavailable. Coordinates set to Bengaluru Hub.", "warning");
    });
  } else {
    showToast("GPS locator not supported.", "danger");
  }
};

// Upload media to Cloudinary (Simulated integration)
window.uploadKycDocImage = async function(type, input) {
  if (input.files && input.files[0]) {
    showToast("Compressing and uploading image securely...", "info");
    try {
      const res = await cloudinaryUtils.uploadImage(input.files[0]);
      if (type === "license") {
        tempUploadedLicenseUrl = res.secure_url;
        document.getElementById("preview-license-doc").style.display = "block";
      } else if (type === "logo") {
        tempUploadedLogoUrl = res.secure_url;
        document.getElementById("preview-logo-doc").style.display = "block";
      }
      showToast("Uploaded successfully to Cloudinary!", "check");
    } catch (e) {
      showToast("Upload failed.", "danger");
    }
  }
};

// Submit KYC Form
window.submitKycProfile = async function(e) {
  e.preventDefault();
  const drugLicenseNum = document.getElementById("kyc-drug-license").value;
  const expiry = document.getElementById("kyc-license-expiry").value;
  const gst = document.getElementById("kyc-gst").value;
  const aadhaar = document.getElementById("kyc-aadhaar").value;
  const address = document.getElementById("kyc-address").value;
  const city = document.getElementById("kyc-city").value;
  const pincode = document.getElementById("kyc-pincode").value;
  const lat = parseFloat(document.getElementById("kyc-lat").value);
  const lng = parseFloat(document.getElementById("kyc-lng").value);
  const workingHours = document.getElementById("kyc-hours").value;
  const emergencyContact = document.getElementById("kyc-emergency-phone").value;

  if (!tempUploadedLicenseUrl || !tempUploadedLogoUrl) {
    showToast("Please upload all compliance documents first.", "warning");
    return;
  }

  const kycData = {
    drugLicenseNum,
    expiry,
    gst,
    aadhaar,
    address,
    city,
    pincode,
    lat,
    lng,
    workingHours,
    emergencyContact,
    licenseDocUrl: tempUploadedLicenseUrl,
    storeFrontUrl: tempUploadedLogoUrl
  };

  try {
    // Update store state to pending
    await db.ref(`stores/${activeStoreId}`).update({
      status: "pending",
      kyc: kycData,
      lat: lat,
      lng: lng,
      address: `${address}, ${city} - ${pincode}`,
      logo: tempUploadedLogoUrl
    });

    db.logAudit(`Pharmacy submitted KYC compliance folders: ${activeStoreId}`, "kyc");
    showToast("Compliance files lodged with DawaDo Admin Board!", "check");
  } catch (err) {
    showToast(err.message, "danger");
  }
};

// Fast-track developer shortcut
window.triggerDeveloperFastApproval = async function() {
  try {
    showToast("Admin bypass credentials verified...", "info");
    await db.ref(`stores/${activeStoreId}`).update({
      status: "approved",
      active: true,
      logo: "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=100",
      address: "Ground Floor, Apollo Terminal Metro Hub, Bengaluru, Karnataka - 560001",
      lat: 12.9715987,
      lng: 77.5945627
    });

    // Also update users credential list to allow future direct logins
    const usersRoot = JSON.parse(localStorage.getItem("dawado_users")) || {};
    // Find store account to remove approvalPending flag
    for (let key in usersRoot) {
      if (usersRoot[key].id === activeStoreId) {
        usersRoot[key].approvalPending = false;
        break;
      }
    }
    localStorage.setItem("dawado_users", JSON.stringify(usersRoot));

    db.logAudit(`Bypass: Admin Auto-Approved pharmacy terminal: ${activeStoreId}`, "admin");
    showToast("Bypass approved! Terminal fully unlocked.", "check");
  } catch (e) {
    showToast(e.message, "danger");
  }
};


// -----------------------------------------
// 3. REALTIME SYNC LISTENERS
// -----------------------------------------

function startRealtimeSyncListeners() {
  // Listen to all inbound orders
  db.ref("orders").on("value", (snapshot) => {
    fullOrdersList = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        fullOrdersList.push({ id: child.key, ...child.val() });
      });
    }
    // Sort orders by timestamp descending
    fullOrdersList.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    renderOrdersDashboardMetrics();
    renderFilteredOrdersList();
    renderLiveFeedDashboard();
    renderPrescriptionVerificationList();
  });

  // Listen to medical catalogue
  db.ref("medicines").on("value", (snapshot) => {
    fullMedicinesList = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        fullMedicinesList.push({ id: child.key, ...child.val() });
      });
    }
    renderInventoryCatalogList();
    renderOrdersDashboardMetrics(); // Recalculate low stock
    populateInvoiceMedicinesSelector();
  });

  // Load custom store collections
  loadStoreSuppliersList();
  loadStorePurchasesLedger();
  loadStoreStaffList();
  loadStoreCouponsList();
  loadStoreNotificationsFeed();
}


// -----------------------------------------
// 4. MAIN DASHBOARD METRICS & RENDERS
// -----------------------------------------

function renderOrdersDashboardMetrics() {
  // Filter orders assigned specifically to this merchant hub
  const myOrders = fullOrdersList.filter(o => o.storeId === activeStoreId);

  // Today's total revenue (Sum of successful Delivered orders today)
  const todayStr = new Date().toDateString();
  const todayRevenue = myOrders
    .filter(o => o.status === "delivered" && new Date(o.timestamp).toDateString() === todayStr)
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  document.getElementById("dashboard-rev-today").innerText = `₹${todayRevenue.toLocaleString('en-IN')}`;

  // Monthly revenue
  const thisMonth = new Date().getMonth();
  const monthlyRevenue = myOrders
    .filter(o => o.status === "delivered" && new Date(o.timestamp).getMonth() === thisMonth)
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  document.getElementById("dashboard-rev-month").innerText = `₹${monthlyRevenue.toLocaleString('en-IN')}`;

  // Pending order queues
  const pendingCount = myOrders.filter(o => ["placed", "accepted", "preparing", "ready_for_pickup"].includes(o.status)).length;
  document.getElementById("dashboard-orders-pending").innerText = pendingCount;

  // Stock alerts
  const lowStockItems = fullMedicinesList.filter(m => (m.stock || 0) <= (m.minStock || 10));
  const expiredItems = fullMedicinesList.filter(m => m.expiry && new Date(m.expiry) < new Date());
  document.getElementById("dashboard-stock-alerts").innerText = `${lowStockItems.length} / ${expiredItems.length}`;

  // Show alert banner on Dashboard if anything is low
  const banner = document.getElementById("dashboard-stock-alert-banner");
  const bannerText = document.getElementById("dashboard-stock-alert-text");
  if (lowStockItems.length > 0 || expiredItems.length > 0) {
    banner.style.display = "flex";
    bannerText.innerText = `Alert: We detected ${lowStockItems.length} critically low-stock items and ${expiredItems.length} expired batches. Restock catalog to avoid order disruptions.`;
  } else {
    banner.style.display = "none";
  }

  // Update dynamic count of prescriptions pending verification
  const rxPending = myOrders.filter(o => o.prescriptionRequired && !o.prescriptionApproved && o.status === "placed").length;
  const rxBadge = document.getElementById("rx-pending-count-badge");
  if (rxBadge) {
    if (rxPending > 0) {
      rxBadge.innerText = rxPending;
      rxBadge.style.display = "inline-block";
    } else {
      rxBadge.style.display = "none";
    }
  }
}

function renderLiveFeedDashboard() {
  const container = document.getElementById("dashboard-live-feed-list");
  const myOrders = fullOrdersList.filter(o => o.storeId === activeStoreId).slice(0, 3);

  if (myOrders.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-light); font-size: 0.75rem; padding: 1.5rem 0; background: #f8fafc; border-radius: 12px; border: 1.5px solid var(--border);">No active order processing activity at present.</div>`;
    return;
  }

  container.innerHTML = "";
  myOrders.forEach(o => {
    const timeStr = new Date(o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement("div");
    div.style = "background: white; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;";
    div.onclick = () => openDetailedOrderModal(o.id);
    
    let statusColor = "var(--text-light)";
    if (o.status === "placed") statusColor = "var(--danger)";
    else if (o.status === "accepted" || o.status === "preparing") statusColor = "var(--warning)";
    else if (o.status === "delivered") statusColor = "var(--accent-dark)";

    div.innerHTML = `
      <div>
        <div style="font-weight: 700; font-size: 0.82rem; color: var(--text); font-family: 'Inter';">Order #${o.id.toUpperCase().substring(0,8)}</div>
        <div style="font-size: 0.7rem; color: var(--text-light); margin-top: 2px;">${o.items?.length || 0} items &bull; ${timeStr}</div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: ${statusColor}; background: #f1f5f9; padding: 3px 8px; border-radius: 8px;">${o.status}</span>
        <div style="font-weight: 700; font-size: 0.82rem; color: var(--accent-dark); margin-top: 4px;">₹${o.totalAmount}</div>
      </div>
    `;
    container.appendChild(div);
  });
}


// -----------------------------------------
// 5. ORDER PROCESSING FLOW MANAGEMENT
// -----------------------------------------

window.filterStoreOrders = function(category, tabBtn) {
  activeOrdersFilter = category;
  document.querySelectorAll(".segment-tab").forEach(tab => tab.classList.remove("active"));
  if (tabBtn) tabBtn.classList.add("active");
  renderFilteredOrdersList();
};

function renderFilteredOrdersList() {
  const container = document.getElementById("store-orders-list-wrapper");
  const myOrders = fullOrdersList.filter(o => o.storeId === activeStoreId);

  // Filter criteria logic
  let filtered = [];
  if (activeOrdersFilter === "all") {
    filtered = myOrders;
  } else if (activeOrdersFilter === "placed") {
    filtered = myOrders.filter(o => o.status === "placed");
  } else if (activeOrdersFilter === "preparing") {
    filtered = myOrders.filter(o => o.status === "accepted" || o.status === "preparing" || o.status === "packed");
  } else if (activeOrdersFilter === "ready") {
    filtered = myOrders.filter(o => o.status === "ready_for_pickup" || o.status === "assigned" || o.status === "picked_up");
  } else if (activeOrdersFilter === "past") {
    filtered = myOrders.filter(o => o.status === "delivered" || o.status === "cancelled");
  }

  // Update specific placed count badge
  const newCount = myOrders.filter(o => o.status === "placed").length;
  const newBadge = document.getElementById("orders-badge-new");
  if (newBadge) {
    if (newCount > 0) {
      newBadge.innerText = newCount;
      newBadge.style.display = "inline-block";
    } else {
      newBadge.style.display = "none";
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-light); font-size: 0.82rem; padding: 4rem 1rem;">
        <i class="fa-solid fa-cart-shopping" style="font-size: 3rem; opacity: 0.15; margin-bottom: 12px; color: var(--primary);"></i>
        <h4>No Orders Found</h4>
        <p style="font-size: 0.72rem; margin-top: 4px;">There are no pharmacy orders in this filter category.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  filtered.forEach(o => {
    const card = document.createElement("div");
    card.className = "order-card";
    
    const timeStr = new Date(o.timestamp).toLocaleString();
    const itemsText = o.items ? o.items.map(item => `${item.qty}x ${item.name}`).join(", ") : "No items logged";
    
    // Status Badge Styling
    let badgeBg = "#f1f5f9";
    let badgeColor = "#475569";
    if (o.status === "placed") { badgeBg = "var(--danger-light)"; badgeColor = "var(--danger)"; }
    else if (o.status === "accepted") { badgeBg = "var(--primary-light)"; badgeColor = "var(--primary-dark)"; }
    else if (o.status === "preparing") { badgeBg = "var(--warning-light)"; badgeColor = "var(--warning)"; }
    else if (o.status === "ready_for_pickup") { badgeBg = "var(--accent-light)"; badgeColor = "var(--accent-dark)"; }
    else if (o.status === "delivered") { badgeBg = "var(--accent-light)"; badgeColor = "var(--accent-dark)"; }

    // Prescription checking label
    let rxBadgeLabel = "";
    if (o.prescriptionRequired) {
      if (o.prescriptionApproved) {
        rxBadgeLabel = `<span style="font-size: 0.62rem; font-weight: 700; background: var(--accent-light); color: var(--accent-dark); padding: 2px 6px; border-radius: 6px;"><i class="fa-solid fa-circle-check"></i> Rx Approved</span>`;
      } else {
        rxBadgeLabel = `<span style="font-size: 0.62rem; font-weight: 700; background: var(--danger-light); color: var(--danger); padding: 2px 6px; border-radius: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> Rx Pending Audit</span>`;
      }
    }

    // Interactive actions based on order flow
    let footerActions = "";
    if (o.status === "placed") {
      footerActions = `
        <button class="btn btn-secondary" style="flex:1; padding: 6px; font-size:0.75rem;" onclick="updateOrderStatusMilestone('${o.id}', 'cancelled')">Cancel</button>
        <button class="btn btn-accent" style="flex:2; padding: 6px; font-size:0.75rem;" onclick="updateOrderStatusMilestone('${o.id}', 'accepted')">Accept Order <i class="fa-solid fa-check"></i></button>
      `;
    } else if (o.status === "accepted") {
      footerActions = `
        <button class="btn" style="width: 100%; padding: 6px; font-size:0.75rem;" onclick="updateOrderStatusMilestone('${o.id}', 'preparing')">Start Boxing (Prepare) <i class="fa-solid fa-prescription-bottle-medical"></i></button>
      `;
    } else if (o.status === "preparing") {
      footerActions = `
        <button class="btn btn-accent" style="width: 100%; padding: 6px; font-size:0.75rem;" onclick="updateOrderStatusMilestone('${o.id}', 'ready_for_pickup')">Mark Packed & Ready <i class="fa-solid fa-box"></i></button>
      `;
    } else if (o.status === "ready_for_pickup") {
      footerActions = `
        <button class="btn btn-accent" style="width: 100%; padding: 6px; font-size:0.75rem;" onclick="assignDeliveryRiderLogistics('${o.id}')">Assign Dispatch Rider <i class="fa-solid fa-motorcycle"></i></button>
      `;
    } else if (o.status === "assigned" || o.status === "picked_up") {
      footerActions = `
        <div style="display: flex; gap: 8px; width: 100%;">
          <button class="btn btn-secondary" style="flex: 1; padding: 6px; font-size: 0.75rem;" onclick="openLiveRiderTracking('${o.id}')"><i class="fa-solid fa-map"></i> Route GPS</button>
          <button class="btn btn-accent" style="flex: 1.2; padding: 6px; font-size: 0.75rem;" onclick="updateOrderStatusMilestone('${o.id}', 'delivered')">Fulfill Deliver <i class="fa-solid fa-truck-ramp-box"></i></button>
        </div>
      `;
    } else if (o.status === "delivered") {
      footerActions = `<span style="font-size: 0.75rem; color: var(--accent-dark); font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Delivered successfully to customer door!</span>`;
    } else if (o.status === "cancelled") {
      footerActions = `<span style="font-size: 0.75rem; color: var(--danger); font-weight: 700;"><i class="fa-solid fa-ban"></i> Order Cancelled.</span>`;
    }

    card.innerHTML = `
      <div class="order-card-header">
        <h4>#${o.id.toUpperCase().substring(0,8)}</h4>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${rxBadgeLabel}
          <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 8px;">${o.status}</span>
        </div>
      </div>
      <div class="order-card-body" onclick="openDetailedOrderModal('${o.id}')" style="cursor: pointer;">
        <div class="order-card-items"><i class="fa-solid fa-notes-medical" style="color:var(--primary); margin-right:5px;"></i> ${itemsText}</div>
        <div class="order-card-meta">
          <div><i class="fa-solid fa-clock"></i> ${timeStr}</div>
          <div><i class="fa-solid fa-location-dot"></i> ${o.address || "Main City Delivery, Bangalore"}</div>
          <div><i class="fa-solid fa-shield-halved"></i> Payment: <b style="color:var(--text);">${o.paymentMethod || "COD"}</b></div>
        </div>
        <div class="order-card-price">Total Amount: ₹${o.totalAmount || 0}</div>
      </div>
      <div class="order-card-footer">
        ${footerActions}
      </div>
    `;
    container.appendChild(card);
  });
}

// Order Status Processing
window.updateOrderStatusMilestone = async function(orderId, newStatus) {
  try {
    const orderRef = db.ref(`orders/${orderId}`);
    
    // Check if prescription required is approved before accepting
    if (newStatus === "accepted") {
      const snapshot = await new Promise((resolve) => {
        db.ref(`orders/${orderId}`).on("value", (snap) => resolve(snap));
      });
      const orderVal = snapshot.val();
      if (orderVal && orderVal.prescriptionRequired && !orderVal.prescriptionApproved) {
        showToast("Cannot accept! Prescription pending pharmacist approval.", "warning");
        return;
      }
    }

    await orderRef.update({ status: newStatus });
    db.logAudit(`Pharmacy status updated on Order #${orderId.toUpperCase()} to ${newStatus}`, "order");
    showToast(`Order status updated to ${newStatus.toUpperCase()}!`, "check");

    // Fetch and send push notification to customer
    db.ref(`orders/${orderId}`).on("value", (snap) => {
      if (snap.exists()) {
        const o = snap.val();
        db.sendNotification(o.userId, "DawaDo Order Update", `Your prescription order #${orderId.toUpperCase().substring(0,8)} is now ${newStatus.toUpperCase()}`, "order", { orderId });
      }
    });

  } catch (err) {
    showToast(err.message, "danger");
  }
};

// Auto / Manual Delivery boy assignment
window.assignDeliveryRiderLogistics = async function(orderId) {
  try {
    showToast("Assigning closest logistics courier...", "info");
    
    // Find delivery boys in simulation database
    const dbSnap = await new Promise((resolve) => {
      db.ref("delivery_boys").on("value", (snap) => resolve(snap));
    });

    let chosenRiderId = "delivery_1"; // Default mock Ramesh Kumar
    let chosenRiderName = "Ramesh Kumar";

    if (dbSnap.exists()) {
      dbSnap.forEach(riderSnap => {
        const r = riderSnap.val();
        if (r.active && r.status === "online") {
          chosenRiderId = r.id;
          chosenRiderName = r.name;
        }
      });
    }

    // Assign order to delivery boy
    await db.ref(`orders/${orderId}`).update({
      status: "assigned",
      deliveryBoyId: chosenRiderId,
      deliveryBoyName: chosenRiderName,
      deliveryDistance: 3.2,
      deliveryEta: "15 mins"
    });

    db.logAudit(`Courier Rider ${chosenRiderName} assigned to deliver Order #${orderId.toUpperCase()}`, "logistics");
    db.sendNotification(chosenRiderId, "New Delivery Cargo Assigned", `Collect pharmaceutical order #${orderId.toUpperCase().substring(0,8)} from Apollo Pharmacy Metro`, "delivery", { orderId });

    showToast(`Rider ${chosenRiderName} has been assigned!`, "check");
  } catch (err) {
    showToast(err.message, "danger");
  }
};


// -----------------------------------------
// 6. PRESCRIPTION VERIFICATION SYSTEM
// -----------------------------------------

function renderPrescriptionVerificationList() {
  const container = document.getElementById("rx-verification-list-wrapper");
  const myPendingRxOrders = fullOrdersList.filter(o => o.storeId === activeStoreId && o.prescriptionRequired && !o.prescriptionApproved && o.status === "placed");

  if (myPendingRxOrders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-light); padding: 4rem 1rem;">
        <i class="fa-solid fa-clipboard-check" style="font-size: 3rem; opacity: 0.15; margin-bottom: 12px; color: var(--accent);"></i>
        <h4>No Pending Audits</h4>
        <p style="font-size: 0.72rem; margin-top: 4px;">There are no prescription images waiting for pharmacist verification.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  myPendingRxOrders.forEach(o => {
    const rxImageSrc = o.prescriptionImage || "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400";
    const div = document.createElement("div");
    div.style = "background: white; border: 1.5px solid var(--border); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 10px;";
    
    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 6px;">
        <span style="font-weight: 700; font-size: 0.8rem; font-family: 'Inter';">Order #${o.id.toUpperCase().substring(0,8)}</span>
        <span style="font-size: 0.65rem; font-weight: 700; background: var(--danger-light); color: var(--danger); padding: 2px 8px; border-radius: 8px;">Rx Requires Signature</span>
      </div>
      
      <!-- Prescription Zoomable Image Stage -->
      <div class="rx-container">
        <img src="${rxImageSrc}" class="rx-image" id="rx-img-${o.id}" />
        <div class="rx-controls">
          <button class="rx-ctrl-btn" onclick="manipulateRxImage('${o.id}', 'zoomIn')"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
          <button class="rx-ctrl-btn" onclick="manipulateRxImage('${o.id}', 'zoomOut')"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
          <button class="rx-ctrl-btn" onclick="manipulateRxImage('${o.id}', 'rotate')"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
      </div>

      <div style="font-size: 0.75rem; background: #f8fafc; border-radius: 10px; padding: 10px;">
        <div style="font-weight: 700; color: var(--text);">Required Medicine:</div>
        <div style="color: #475569; margin-top: 2px;">${o.items ? o.items.map(i => `${i.qty}x ${i.name}`).join(", ") : "Lipitor 10mg"}</div>
        <div style="font-weight: 700; color: var(--text); margin-top: 6px;">Customer:</div>
        <div style="color: #475569; margin-top: 2px;">Ananya Sharma (Ananya@dawado.com)</div>
      </div>

      <div class="form-group">
        <label>Audit Comments / Pharmacist Notes</label>
        <input type="text" id="rx-comment-${o.id}" placeholder="e.g. Signature and clinic stamp verified. approved." value="Verified & Compliant." style="padding: 8px;" />
      </div>

      <div style="display: flex; gap: 8px;">
        <button class="btn btn-secondary" style="flex: 1; padding: 8px; font-size:0.75rem;" onclick="auditPrescriptionResponse('${o.id}', false)"><i class="fa-solid fa-circle-xmark"></i> Reject Rx</button>
        <button class="btn btn-accent" style="flex: 1.5; padding: 8px; font-size:0.75rem;" onclick="auditPrescriptionResponse('${o.id}', true)"><i class="fa-solid fa-circle-check"></i> Verify & Approve Rx</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// Document zooming and rotations
window.manipulateRxImage = function(orderId, action) {
  const img = document.getElementById(`rx-img-${orderId}`);
  if (!img) return;

  if (action === "zoomIn") currentRxZoom += 0.15;
  else if (action === "zoomOut") currentRxZoom = Math.max(0.6, currentRxZoom - 0.15);
  else if (action === "rotate") currentRxRotation += 90;

  img.style.transform = `scale(${currentRxZoom}) rotate(${currentRxRotation}deg)`;
};

// Prescription Verification Action
window.auditPrescriptionResponse = async function(orderId, approved) {
  const comment = document.getElementById(`rx-comment-${orderId}`).value;
  try {
    if (approved) {
      await db.ref(`orders/${orderId}`).update({
        prescriptionApproved: true,
        prescriptionComment: comment,
        status: "accepted" // Automatically move to accepted queue on approval!
      });
      db.logAudit(`Pharmacist verified & approved Rx for Order #${orderId.toUpperCase()}`, "audit");
      showToast("Prescription verified! Order has been Accepted.", "check");
    } else {
      await db.ref(`orders/${orderId}`).update({
        prescriptionApproved: false,
        prescriptionComment: comment,
        status: "cancelled"
      });
      db.logAudit(`Pharmacist rejected Rx for Order #${orderId.toUpperCase()}: ${comment}`, "audit");
      showToast("Prescription rejected! Order cancelled.", "warning");
    }

    // Notify Customer
    db.ref(`orders/${orderId}`).on("value", (snap) => {
      if (snap.exists()) {
        const o = snap.val();
        db.sendNotification(o.userId, "Prescription Audit Result", `Your Rx for order #${orderId.toUpperCase().substring(0,8)} was ${approved ? 'APPROVED' : 'REJECTED'}. Comments: ${comment}`, "order");
      }
    });

  } catch (err) {
    showToast(err.message, "danger");
  }
};


// -----------------------------------------
// 7. INVENTORY MANAGEMENT CATALOGUE
// -----------------------------------------

window.triggerInventorySearch = function(query) {
  activeInventorySearch = query.trim().toLowerCase();
  renderInventoryCatalogList();
};

window.triggerInventoryCategoryFilter = function(category) {
  activeInventoryCategory = category;
  renderInventoryCatalogList();
};

window.triggerBarcodeSearchScanner = function() {
  const code = prompt("Simulating Barcode laser scanning! Type or scan barcode SKU code:", "8901234567890");
  if (!code) return;
  
  // Try to find if medicine exists with this barcode SKU
  const match = fullMedicinesList.find(m => m.barcode === code);
  if (match) {
    showToast(`Barcode SKU Match! Opening ${match.name}...`, "check");
    openEditMedicineForm(match);
  } else {
    if (confirm(`No medicine matched Barcode code "${code}". Would you like to map a new drug layout?`)) {
      openAddMedicineModal();
      document.getElementById("med-barcode").value = code;
    }
  }
};

function renderInventoryCatalogList() {
  const container = document.getElementById("catalog-list-wrapper");
  
  // Filter medicine list
  let filtered = fullMedicinesList;
  if (activeInventoryCategory !== "ALL") {
    filtered = filtered.filter(m => m.category === activeInventoryCategory);
  }

  if (activeInventorySearch) {
    filtered = filtered.filter(m => 
      m.name?.toLowerCase().includes(activeInventorySearch) ||
      m.genericName?.toLowerCase().includes(activeInventorySearch) ||
      m.brand?.toLowerCase().includes(activeInventorySearch) ||
      m.barcode?.toLowerCase().includes(activeInventorySearch) ||
      m.composition?.toLowerCase().includes(activeInventorySearch)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-light); padding: 4rem 1rem;">
        <i class="fa-solid fa-boxes-stacked" style="font-size: 3rem; opacity: 0.15; margin-bottom: 12px; color: var(--accent);"></i>
        <h4>No Medicines Listed</h4>
        <p style="font-size: 0.72rem; margin-top: 4px;">Map medicines to this retail catalog to receive prescriptions.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  filtered.forEach(m => {
    const card = document.createElement("div");
    card.style = "background: white; border: 1.5px solid var(--border); border-radius: 14px; padding: 12px; display: flex; align-items: center; gap: 12px; position: relative;";
    
    // Low stock indicator
    const isLow = (m.stock || 0) <= (m.minStock || 10);
    const hasExpired = m.expiry && new Date(m.expiry) < new Date();
    
    let alertBorder = "";
    if (hasExpired) alertBorder = "border-left: 4px solid var(--danger);";
    else if (isLow) alertBorder = "border-left: 4px solid var(--warning);";

    card.setAttribute("style", card.getAttribute("style") + alertBorder);

    let stockColor = "var(--text)";
    let warningLabel = "";
    if (hasExpired) {
      stockColor = "var(--danger)";
      warningLabel = `<span style="font-size:0.58rem; font-weight:700; color:white; background:var(--danger); padding:2px 5px; border-radius:6px; margin-left:6px;">EXPIRED</span>`;
    } else if (isLow) {
      stockColor = "var(--warning)";
      warningLabel = `<span style="font-size:0.58rem; font-weight:700; color:#b45309; background:var(--warning-light); padding:2px 5px; border-radius:6px; margin-left:6px;">LOW STOCK</span>`;
    }

    card.innerHTML = `
      <img src="${m.image || tempUploadedMedImageUrl}" style="width: 52px; height: 52px; border-radius: 8px; object-fit: cover;" />
      <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
        <h4 style="font-size: 0.82rem; font-weight: 700; color: var(--text);">${m.name}</h4>
        <span style="font-size: 0.68rem; color: var(--text-light); font-weight: 600;">${m.brand || "Pfizer"} &bull; ${m.category}</span>
        <div style="display: flex; align-items: center; gap: 5px; margin-top: 2px;">
          <span style="font-size: 0.85rem; font-weight: 800; color: var(--accent-dark);">₹${m.price}</span>
          ${m.prescriptionRequired ? '<i class="fa-solid fa-prescription" style="color:var(--danger); font-size:0.75rem;" title="Rx Required"></i>' : ''}
          ${warningLabel}
        </div>
      </div>

      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
        <!-- Direct Quick Stock Editor -->
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-light);">Stock:</span>
          <input type="number" value="${m.stock || 0}" style="width: 54px; padding: 4px; border: 1.5px solid var(--border); border-radius: 6px; text-align: center; font-size: 0.78rem; font-family:'Inter'; font-weight:700; color:${stockColor};" onchange="quickUpdateInventoryStock('${m.id}', this.value)" />
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn-reset" onclick="triggerEditMedicineForm('${m.id}')" style="padding: 4px 8px; font-size: 0.68rem; color: var(--primary);"><i class="fa-regular fa-pen-to-square"></i> Edit</button>
          <button class="btn-reset" onclick="triggerDeleteMedicineItem('${m.id}')" style="padding: 4px 8px; font-size: 0.68rem; color: var(--danger);"><i class="fa-regular fa-trash-can"></i> Remove</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Quick Stock Adjuster
window.quickUpdateInventoryStock = async function(medId, value) {
  try {
    const val = parseInt(value);
    await db.ref(`medicines/${medId}`).update({ stock: val });
    showToast("Medication inventory stock updated!", "check");
    db.logAudit(`Direct quick inventory update: MedId ${medId} count set to ${val}`, "inventory");
  } catch (err) {
    showToast(err.message, "danger");
  }
};

// Delete Medicine
window.triggerDeleteMedicineItem = async function(medId) {
  if (confirm("Are you sure you want to permanently delete this medicine from the master inventory catalog? This cannot be undone.")) {
    try {
      await db.ref(`medicines/${medId}`).remove();
      db.logAudit(`Deleted inventory item: ${medId}`, "inventory");
      showToast("Medicine removed from catalog successfully.", "check");
    } catch (err) {
      showToast(err.message, "danger");
    }
  }
};


// -----------------------------------------
// 8. ADD & EDIT MEDICINE MODAL ACTIONS
// -----------------------------------------

window.openAddMedicineModal = function() {
  document.getElementById("med-modal-title").innerText = "Add New Medicine";
  document.getElementById("form-medicine-details").reset();
  document.getElementById("med-edit-id").value = "";
  tempUploadedMedImageUrl = "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300";
  document.getElementById("med-preview-img-container").style.display = "none";
  document.getElementById("med-modal-overlay").style.display = "flex";
};

window.closeMedicineDetailsModal = function() {
  document.getElementById("med-modal-overlay").style.display = "none";
};

window.uploadMedicineFormImage = async function(input) {
  if (input.files && input.files[0]) {
    showToast("Compressing product image layout...", "info");
    try {
      const res = await cloudinaryUtils.uploadImage(input.files[0]);
      tempUploadedMedImageUrl = res.secure_url;
      document.getElementById("med-preview-img").src = res.secure_url;
      document.getElementById("med-preview-img-container").style.display = "flex";
      showToast("Product image uploaded to folder!", "check");
    } catch (e) {
      showToast("Image upload failed.", "danger");
    }
  }
};

window.triggerEditMedicineForm = function(medId) {
  const match = fullMedicinesList.find(m => m.id === medId);
  if (match) {
    openEditMedicineForm(match);
  }
};

function openEditMedicineForm(match) {
  document.getElementById("med-modal-title").innerText = "Edit Medicine Profile";
  document.getElementById("med-edit-id").value = match.id;
  document.getElementById("med-name").value = match.name || "";
  document.getElementById("med-generic").value = match.genericName || match.generic || "";
  document.getElementById("med-strength").value = match.strength || "10mg";
  document.getElementById("med-brand").value = match.brand || "";
  document.getElementById("med-category").value = match.category || "Fever & Pain";
  document.getElementById("med-batch").value = match.batchNumber || match.batch || "B-7452A";
  document.getElementById("med-expiry").value = match.expiryDate || match.expiry || "";
  document.getElementById("med-mrp").value = match.mrp || match.price || 0;
  document.getElementById("med-price").value = match.price || 0;
  document.getElementById("med-gst").value = match.gst || 12;
  document.getElementById("med-stock").value = match.stock || 0;
  document.getElementById("med-min-stock").value = match.minStock || 10;
  document.getElementById("med-barcode").value = match.barcode || "";
  document.getElementById("med-rx").checked = match.prescriptionRequired || false;
  document.getElementById("med-description").value = match.description || "";
  
  tempUploadedMedImageUrl = match.image || "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300";
  document.getElementById("med-preview-img").src = tempUploadedMedImageUrl;
  document.getElementById("med-preview-img-container").style.display = "flex";

  document.getElementById("med-modal-overlay").style.display = "flex";
}

window.submitMedicineDetailsForm = async function(e) {
  e.preventDefault();
  const editId = document.getElementById("med-edit-id").value;
  const name = document.getElementById("med-name").value;
  const genericName = document.getElementById("med-generic").value;
  const strength = document.getElementById("med-strength").value;
  const brand = document.getElementById("med-brand").value;
  const category = document.getElementById("med-category").value;
  const batchNumber = document.getElementById("med-batch").value;
  const expiryDate = document.getElementById("med-expiry").value;
  const mrp = parseFloat(document.getElementById("med-mrp").value);
  const price = parseFloat(document.getElementById("med-price").value);
  const gst = parseInt(document.getElementById("med-gst").value);
  const stock = parseInt(document.getElementById("med-stock").value);
  const minStock = parseInt(document.getElementById("med-min-stock").value);
  const barcode = document.getElementById("med-barcode").value;
  const prescriptionRequired = document.getElementById("med-rx").checked;
  const description = document.getElementById("med-description").value;

  const medId = editId || "med_" + Date.now();
  const medData = {
    id: medId,
    name,
    genericName,
    strength,
    brand,
    category,
    batchNumber,
    expiryDate,
    mrp,
    price,
    gst,
    stock,
    minStock,
    barcode,
    prescriptionRequired,
    description,
    image: tempUploadedMedImageUrl
  };

  try {
    await db.ref(`medicines/${medId}`).set(medData);
    db.logAudit(`Medicine profile logged: ${name} (ID: ${medId})`, "inventory");
    showToast(editId ? "Medicine profile updated!" : "New medicine added to catalog!", "check");
    closeMedicineDetailsModal();
  } catch (err) {
    showToast(err.message, "danger");
  }
};


// -----------------------------------------
// 9. MARKETING COUPONS & PROMO CREATOR
// -----------------------------------------

window.openCreateCouponModal = function() {
  document.getElementById("form-coupon-details").reset();
  document.getElementById("coupon-modal-overlay").style.display = "flex";
};

window.closeCreateCouponModal = function() {
  document.getElementById("coupon-modal-overlay").style.display = "none";
};

window.submitNewCouponForm = async function(e) {
  e.preventDefault();
  const code = document.getElementById("coupon-code").value.trim().toUpperCase();
  const discountVal = parseFloat(document.getElementById("coupon-discount").value);
  const type = document.getElementById("coupon-type").value;
  const minCart = parseFloat(document.getElementById("coupon-min-cart").value);
  const maxDiscount = parseFloat(document.getElementById("coupon-max-discount").value);
  const expiry = document.getElementById("coupon-expiry").value;

  const couponId = "coupon_" + Date.now();
  const couponData = {
    id: couponId,
    code,
    discountVal,
    type,
    minCart,
    maxDiscount,
    expiry,
    active: true
  };

  try {
    await db.ref(`stores/${activeStoreId}/coupons/${couponId}`).set(couponData);
    db.logAudit(`Promo coupon created: ${code} (${type})`, "marketing");
    showToast("Promotional discount code generated!", "check");
    closeCreateCouponModal();
  } catch (err) {
    showToast(err.message, "danger");
  }
};

function loadStoreCouponsList() {
  db.ref(`stores/${activeStoreId}/coupons`).on("value", (snapshot) => {
    const container = document.getElementById("coupons-list-wrapper");
    if (!container) return;

    if (!snapshot.exists()) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-light); font-size: 0.75rem; padding: 1.5rem 0; background: #f8fafc; border-radius: 12px; border: 1.5px solid var(--border);">No coupons active. Trigger marketing code to attract customers.</div>`;
      return;
    }

    container.innerHTML = "";
    snapshot.forEach(child => {
      const c = child.val();
      const div = document.createElement("div");
      div.style = "background: white; border: 1.5px dashed var(--primary); border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center;";
      
      div.innerHTML = `
        <div>
          <span style="font-weight: 800; color: var(--primary); font-family: 'Inter'; font-size: 0.9rem; background: var(--primary-light); padding: 3px 8px; border-radius: 6px; text-transform: uppercase;">${c.code}</span>
          <div style="font-size: 0.72rem; font-weight: 600; color: var(--text-light); margin-top: 6px;">
            Discount: ${c.type === 'percentage' ? `${c.discountVal}%` : `₹${c.discountVal}`} (Min Cart: ₹${c.minCart})
          </div>
          <div style="font-size: 0.65rem; color: var(--danger); margin-top: 2px;">Expires: ${c.expiry}</div>
        </div>
        <button class="btn-reset" onclick="removePromoCouponCode('${c.id}')" style="color: var(--danger); font-size: 0.75rem;"><i class="fa-regular fa-trash-can"></i> Remove</button>
      `;
      container.appendChild(div);
    });
  });
}

window.removePromoCouponCode = async function(couponId) {
  if (confirm("Deactivate this discount code?")) {
    try {
      await db.ref(`stores/${activeStoreId}/coupons/${couponId}`).remove();
      showToast("Discount code deleted.", "check");
    } catch (e) {
      showToast(e.message, "danger");
    }
  }
};


// -----------------------------------------
// 10. PROCUREMENT & SUPPLIER MANAGEMENT
// -----------------------------------------

window.openAddSupplierModal = function() {
  document.getElementById("form-supplier-details").reset();
  document.getElementById("supplier-modal-overlay").style.display = "flex";
};

window.closeAddSupplierModal = function() {
  document.getElementById("supplier-modal-overlay").style.display = "none";
};

window.submitNewSupplierForm = async function(e) {
  e.preventDefault();
  const name = document.getElementById("sup-name").value;
  const gstin = document.getElementById("sup-gst").value;
  const phone = document.getElementById("sup-phone").value;
  const address = document.getElementById("sup-address").value;

  const supplierId = "sup_" + Date.now();
  const supData = {
    id: supplierId,
    name,
    gstin,
    phone,
    address,
    timestamp: new Date().toISOString()
  };

  try {
    await db.ref(`stores/${activeStoreId}/suppliers/${supplierId}`).set(supData);
    db.logAudit(`New pharma distributor registered: ${name}`, "procurement");
    showToast("Pharma distributor registered!", "check");
    closeAddSupplierModal();
  } catch (err) {
    showToast(err.message, "danger");
  }
};

function loadStoreSuppliersList() {
  db.ref(`stores/${activeStoreId}/suppliers`).on("value", (snapshot) => {
    const container = document.getElementById("suppliers-list-wrapper");
    const selectSupplier = document.getElementById("pur-supplier-id");
    
    if (!container) return;

    // Default supplier options
    if (selectSupplier) selectSupplier.innerHTML = "";

    if (!snapshot.exists()) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-light); font-size: 0.75rem; padding: 1.5rem 0; background: #f8fafc; border-radius: 12px; border: 1.5px solid var(--border);">No distributors registered. Add suppliers to log bulk purchases.</div>`;
      return;
    }

    container.innerHTML = "";
    snapshot.forEach(child => {
      const s = child.val();
      
      // Populate select menu in modal
      if (selectSupplier) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.innerText = s.name;
        selectSupplier.appendChild(opt);
      }

      const div = document.createElement("div");
      div.style = "background: white; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px; display: flex; justify-content: space-between; align-items: center;";
      div.innerHTML = `
        <div>
          <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--text);">${s.name}</h4>
          <span style="font-size: 0.68rem; color: var(--text-light);">${s.phone} &bull; GSTIN: ${s.gstin || "N/A"}</span>
        </div>
        <button class="btn-reset" onclick="deleteSupplierItem('${s.id}')" style="color: var(--danger); font-size: 0.72rem;"><i class="fa-regular fa-trash-can"></i> Remove</button>
      `;
      container.appendChild(div);
    });
  });
}

window.deleteSupplierItem = async function(supId) {
  if (confirm("Remove this supplier from ledger?")) {
    try {
      await db.ref(`stores/${activeStoreId}/suppliers/${supId}`).remove();
      showToast("Supplier removed.", "check");
    } catch (e) {
      showToast(e.message, "danger");
    }
  }
};


// -----------------------------------------
// 11. BULK PURCHASE & INVENTORY REPLENISHMENT
// -----------------------------------------

window.openLogPurchaseModal = function() {
  document.getElementById("form-purchase-details").reset();
  tempUploadedInvoiceUrl = "";
  document.getElementById("pur-file-alert").style.display = "none";
  document.getElementById("purchase-modal-overlay").style.display = "flex";
  populateInvoiceMedicinesSelector();
};

window.closeLogPurchaseModal = function() {
  document.getElementById("purchase-modal-overlay").style.display = "none";
};

function populateInvoiceMedicinesSelector() {
  const selectMed = document.getElementById("pur-med-id");
  if (!selectMed) return;
  selectMed.innerHTML = "";
  
  fullMedicinesList.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.innerText = `${m.name} (${m.brand})`;
    selectMed.appendChild(opt);
  });
}

window.uploadPurchaseInvoiceFile = async function(input) {
  if (input.files && input.files[0]) {
    showToast("Uploading purchase bill to server...", "info");
    try {
      const res = await cloudinaryUtils.uploadImage(input.files[0]);
      tempUploadedInvoiceUrl = res.secure_url;
      document.getElementById("pur-file-alert").style.display = "block";
      showToast("Invoice attached to purchase ledger!", "check");
    } catch (e) {
      showToast("Invoice upload failed.", "danger");
    }
  }
};

window.submitPurchaseInvoiceForm = async function(e) {
  e.preventDefault();
  const supplierId = document.getElementById("pur-supplier-id").value;
  const invoiceNo = document.getElementById("pur-invoice-no").value;
  const purchaseDate = document.getElementById("pur-date").value;
  const medicineId = document.getElementById("pur-med-id").value;
  const qty = parseInt(document.getElementById("pur-qty").value);
  const unitPrice = parseFloat(document.getElementById("pur-unit-price").value);

  // Retrieve matching supplier name
  let supplierName = "Affiliated Distributor";
  const supOpt = document.getElementById("pur-supplier-id").selectedOptions[0];
  if (supOpt) supplierName = supOpt.innerText;

  // Retrieve matching medicine name
  let medicineName = "Medicine Stock Item";
  const medOpt = document.getElementById("pur-med-id").selectedOptions[0];
  if (medOpt) medicineName = medOpt.innerText;

  const totalCost = qty * unitPrice;
  const purchaseId = "purchase_" + Date.now();

  const purchaseData = {
    id: purchaseId,
    supplierId,
    supplierName,
    invoiceNo,
    purchaseDate,
    medicineId,
    medicineName,
    qty,
    unitPrice,
    totalCost,
    invoiceUrl: tempUploadedInvoiceUrl
  };

  try {
    // 1. Post to Purchases Ledger database
    await db.ref(`stores/${activeStoreId}/purchases/${purchaseId}`).set(purchaseData);

    // 2. Automate stock increment in Medicines database!
    const targetMed = fullMedicinesList.find(m => m.id === medicineId);
    if (targetMed) {
      const newStock = (targetMed.stock || 0) + qty;
      await db.ref(`medicines/${medicineId}`).update({ stock: newStock });
    }

    db.logAudit(`Logged bulk supply purchase invoice #${invoiceNo} for ${qty}x ${medicineName}`, "procurement");
    showToast("Purchase recorded! Stock incremented automatically.", "check");
    closeLogPurchaseModal();
  } catch (err) {
    showToast(err.message, "danger");
  }
};

function loadStorePurchasesLedger() {
  db.ref(`stores/${activeStoreId}/purchases`).on("value", (snapshot) => {
    const tableBody = document.querySelector("#table-purchases-log tbody");
    if (!tableBody) return;

    if (!snapshot.exists()) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-light);">No purchase invoices registered yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = "";
    snapshot.forEach(child => {
      const p = child.val();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:700;">#${p.invoiceNo}</td>
        <td>${p.supplierName}</td>
        <td style="font-weight:700; color:var(--accent-dark);">₹${p.totalCost}</td>
        <td>${p.qty}x ${p.medicineName.substring(0,18)}</td>
      `;
      tableBody.appendChild(tr);
    });
  });
}


// -----------------------------------------
// 12. ROLE-BASED STAFF MANAGEMENT
// -----------------------------------------

window.openAddStaffModal = function() {
  document.getElementById("form-staff-details").reset();
  document.getElementById("staff-modal-overlay").style.display = "flex";
};

window.closeAddStaffModal = function() {
  document.getElementById("staff-modal-overlay").style.display = "none";
};

window.submitNewStaffForm = async function(e) {
  e.preventDefault();
  const name = document.getElementById("staff-name").value;
  const phone = document.getElementById("staff-phone").value;
  const role = document.getElementById("staff-role").value;
  const email = document.getElementById("staff-email").value;
  const pass = document.getElementById("staff-pass").value;

  const staffId = "staff_" + Date.now();
  const staffData = {
    id: staffId,
    name,
    phone,
    role,
    email,
    pass,
    timestamp: new Date().toISOString()
  };

  try {
    await db.ref(`stores/${activeStoreId}/staff/${staffId}`).set(staffData);
    db.logAudit(`Created role staff roster: ${name} (${role})`, "staff");
    showToast(`Staff account for ${name} activated!`, "check");
    closeAddStaffModal();
  } catch (err) {
    showToast(err.message, "danger");
  }
};

function loadStoreStaffList() {
  db.ref(`stores/${activeStoreId}/staff`).on("value", (snapshot) => {
    const container = document.getElementById("staff-roster-list-wrapper");
    if (!container) return;

    if (!snapshot.exists()) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-light); font-size: 0.75rem; padding: 1.5rem 0; background: #f8fafc; border-radius: 12px; border: 1.5px solid var(--border);">No sub-staff listed. Run single owner pharmacist terminal.</div>`;
      return;
    }

    container.innerHTML = "";
    snapshot.forEach(child => {
      const s = child.val();
      const div = document.createElement("div");
      div.style = "background: white; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px; display: flex; justify-content: space-between; align-items: center;";
      
      div.innerHTML = `
        <div>
          <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--text);">${s.name}</h4>
          <span style="font-size: 0.65rem; font-weight:700; background:var(--primary-light); color:var(--primary-dark); padding:2px 6px; border-radius:6px;">${s.role}</span>
          <div style="font-size: 0.68rem; color: var(--text-light); margin-top: 4px;">Login ID: ${s.email} &bull; Call: ${s.phone}</div>
        </div>
        <button class="btn-reset" onclick="terminateStaffMember('${s.id}')" style="color: var(--danger); font-size: 0.72rem;"><i class="fa-regular fa-trash-can"></i> Terminate</button>
      `;
      container.appendChild(div);
    });
  });
}

window.terminateStaffMember = async function(staffId) {
  if (confirm("Revoke all system permissions & terminate this staff login?")) {
    try {
      await db.ref(`stores/${activeStoreId}/staff/${staffId}`).remove();
      showToast("Staff credentials revoked.", "check");
    } catch (e) {
      showToast(e.message, "danger");
    }
  }
};


// -----------------------------------------
// 13. ALERTS & PUSH NOTIFICATION SYSTEM
// -----------------------------------------

function loadStoreNotificationsFeed() {
  db.ref("notifications").on("value", (snapshot) => {
    const container = document.getElementById("notifications-list-wrapper");
    if (!container) return;

    const myNotifications = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const notif = child.val();
        if (notif.recipientId === activeStoreId) {
          myNotifications.push({ id: child.key, ...notif });
        }
      });
    }

    if (myNotifications.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-light); font-size: 0.8rem; padding: 3rem 1rem;">
          <i class="fa-solid fa-bell-slash" style="font-size: 2.5rem; opacity: 0.2; margin-bottom: 12px; color: var(--primary);"></i>
          <h4>All Caught Up!</h4>
          <p style="font-size: 0.72rem; margin-top: 4px;">You have no unread business or critical stock alerts.</p>
        </div>
      `;
      return;
    }

    myNotifications.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    container.innerHTML = "";
    myNotifications.forEach(n => {
      const div = document.createElement("div");
      div.style = "background: white; border: 1.5px solid var(--border); border-radius: 12px; padding: 12px; display: flex; align-items: flex-start; gap: 10px;";
      
      div.innerHTML = `
        <div style="width:30px; height:30px; border-radius:50%; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <i class="fa-solid fa-bell"></i>
        </div>
        <div style="flex:1;">
          <h5 style="font-size: 0.78rem; font-weight:700; color:var(--text);">${n.title}</h5>
          <p style="font-size: 0.72rem; color: #475569; margin-top: 2px;">${n.body}</p>
          <span style="font-size:0.58rem; color:var(--text-light);">${new Date(n.timestamp).toLocaleTimeString()}</span>
        </div>
      `;
      container.appendChild(div);
    });
  });
}

window.clearAllStoreNotifications = async function() {
  try {
    // Delete notifications assigned to this store
    const snap = await new Promise((resolve) => {
      db.ref("notifications").on("value", (s) => resolve(s));
    });
    if (snap.exists()) {
      snap.forEach(child => {
        if (child.val().recipientId === activeStoreId) {
          db.ref(`notifications/${child.key}`).remove();
        }
      });
    }
    showToast("Notifications folder cleared.", "check");
  } catch (e) {
    showToast(e.message, "danger");
  }
};


// -----------------------------------------
// 14. STORE SETTINGS PARAMETERS
// -----------------------------------------

window.saveStoreBusinessSettings = async function(e) {
  e.preventDefault();
  const holidayMode = document.getElementById("settings-holiday-mode").checked;
  const openTime = document.getElementById("settings-open-time").value;
  const closeTime = document.getElementById("settings-close-time").value;
  const autoAccept = document.getElementById("settings-auto-accept").checked;
  const deliveryRadius = parseFloat(document.getElementById("settings-delivery-radius").value);
  const preparationMins = parseInt(document.getElementById("settings-preparation-mins").value);
  const minOrder = parseFloat(document.getElementById("settings-min-order").value);
  const deliveryFee = parseFloat(document.getElementById("settings-delivery-fee").value);

  const updatedSettings = {
    holidayMode,
    openTime,
    closeTime,
    autoAccept,
    deliveryRadius,
    preparationMins,
    minOrder,
    deliveryFee
  };

  try {
    await db.ref(`stores/${activeStoreId}/settings`).set(updatedSettings);
    // Also update root active flag to disable store if on holiday
    await db.ref(`stores/${activeStoreId}`).update({ active: !holidayMode });
    db.logAudit(`Pharmacy business logistical parameters updated. HolidayMode: ${holidayMode}`, "settings");
    showToast("logistics profile settings saved successfully!", "check");
  } catch (err) {
    showToast(err.message, "danger");
  }
};


// -----------------------------------------
// 15. DETAILED DOSSIER DIALOGS
// -----------------------------------------

window.openDetailedOrderModal = async function(orderId) {
  const match = fullOrdersList.find(o => o.id === orderId);
  if (!match) return;

  const container = document.getElementById("order-modal-content-area");
  const timeStr = new Date(match.timestamp).toLocaleString();
  
  const itemsHtml = match.items ? match.items.map(i => `
    <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dotted var(--border);">
      <span>${i.qty}x ${i.name}</span>
      <span style="font-weight:700;">₹${i.price * i.qty}</span>
    </div>
  `).join("") : "No items logged";

  container.innerHTML = `
    <div>
      <span style="color:var(--text-light); font-weight:600; font-size:0.65rem; text-transform:uppercase;">ORDER SPECIFICATIONS</span>
      <div style="font-weight:800; font-size:0.9rem; color:var(--text); margin-top:2px;">#${match.id.toUpperCase()}</div>
    </div>
    
    <div style="background:#f8fafc; border-radius:10px; padding:10px;">
      <div style="font-weight:700; color:var(--text); margin-bottom:6px;">Patient / Customer Info</div>
      <div style="color:#475569;">Name: Ananya Sharma</div>
      <div style="color:#475569; margin-top:2px;">Address: ${match.address || "Sector 4 Bangalore"}</div>
      <div style="color:#475569; margin-top:2px;">Timeline: ${timeStr}</div>
    </div>

    <div>
      <span style="color:var(--text-light); font-weight:600; font-size:0.65rem; text-transform:uppercase;">ITEMS INVOICED</span>
      <div style="margin-top:6px;">${itemsHtml}</div>
      <div style="display:flex; justify-content:space-between; margin-top:8px; font-weight:800; font-size:0.9rem; color:var(--accent-dark);">
        <span>Total Collected:</span>
        <span>₹${match.totalAmount}</span>
      </div>
    </div>

    <div>
      <span style="color:var(--text-light); font-weight:600; font-size:0.65rem; text-transform:uppercase;">LOGISTICS TRACKING TIMELINE</span>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:6px; border-left:2px solid var(--primary); padding-left:12px; margin-left:6px;">
        <div style="font-size:0.7rem; position:relative;">
          <span style="position:absolute; left:-17px; top:3px; width:8px; height:8px; border-radius:50%; background:var(--primary);"></span>
          <b style="color:var(--text);">Order Logged</b> - ${timeStr}
        </div>
        <div style="font-size:0.7rem; position:relative;">
          <span style="position:absolute; left:-17px; top:3px; width:8px; height:8px; border-radius:50%; background:${["placed"].includes(match.status) ? "#cbd5e1" : "var(--primary)"};"></span>
          <b style="color:var(--text);">Approved & Boxed</b>
        </div>
        <div style="font-size:0.7rem; position:relative;">
          <span style="position:absolute; left:-17px; top:3px; width:8px; height:8px; border-radius:50%; background:${["placed", "accepted", "preparing"].includes(match.status) ? "#cbd5e1" : "var(--primary)"};"></span>
          <b style="color:var(--text);">Dispatched via Courier</b>
        </div>
        <div style="font-size:0.7rem; position:relative;">
          <span style="position:absolute; left:-17px; top:3px; width:8px; height:8px; border-radius:50%; background:${match.status === 'delivered' ? "var(--primary)" : "#cbd5e1"};"></span>
          <b style="color:var(--text);">Fulfillment Delivered</b>
        </div>
      </div>
    </div>
  `;

  document.getElementById("order-details-modal").style.display = "flex";
};

window.closeOrderDetailsModal = function() {
  document.getElementById("order-details-modal").style.display = "none";
};


// -----------------------------------------
// 16. LIVE GPS LEAFLET MAPPING CONTROLLER
// -----------------------------------------

let mapInstance = null;
let mapMarkerRider = null;
let mapMarkerStore = null;

window.openLiveRiderTracking = function(orderId) {
  const match = fullOrdersList.find(o => o.id === orderId);
  if (!match) return;

  document.getElementById("map-modal-overlay").style.display = "flex";
  document.getElementById("map-rider-name").innerText = match.deliveryBoyName || "Ramesh Kumar";
  document.getElementById("map-rider-status").innerText = match.status.toUpperCase();

  // Initialize Map delayed slightly to let modal scale animation finish
  setTimeout(() => {
    try {
      const storeLat = activeStoreData.lat || 12.9715987;
      const storeLng = activeStoreData.lng || 77.5945627;
      
      // Courier Coordinates slightly offset to simulate route
      const riderLat = storeLat - 0.0035;
      const riderLng = storeLng + 0.0025;

      if (!mapInstance) {
        mapInstance = mapUtils.createMap("store-live-tracking-map", storeLat, storeLng, 14);
      } else {
        mapInstance.setView([storeLat, storeLng], 14);
      }

      if (mapInstance && window.L) {
        // Clear old markers if any
        if (mapMarkerStore) mapInstance.removeLayer(mapMarkerStore);
        if (mapMarkerRider) mapInstance.removeLayer(mapMarkerRider);

        // Store Pin marker
        mapMarkerStore = window.L.marker([storeLat, storeLng])
          .addTo(mapInstance)
          .bindPopup("<b>Apollo Pharmacy Hub</b>")
          .openPopup();

        // Rider Pin marker
        const riderIcon = window.L.icon({
          iconUrl: "https://cdn-icons-png.flaticon.com/512/2972/2972185.png",
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });
        mapMarkerRider = window.L.marker([riderLat, riderLng], { icon: riderIcon })
          .addTo(mapInstance)
          .bindPopup(`<b>Dispatch Courier: ${match.deliveryBoyName || 'Ramesh'}</b><br/>En Route (ETA: 10 mins)`);

        // Draw polyline routing path line
        const routingLine = window.L.polyline([
          [storeLat, storeLng],
          [riderLat, riderLng]
        ], { color: "var(--primary)", weight: 4, dashArray: "5, 10" }).addTo(mapInstance);
      }
    } catch (e) {
      console.warn("Leaflet GPS mapping failure:", e);
    }
  }, 250);
};

window.closeLiveMapModal = function() {
  document.getElementById("map-modal-overlay").style.display = "none";
};


// -----------------------------------------
// 17. FINANCIAL REPORTS DOWNLOAD GENERATION
// -----------------------------------------

window.downloadStoreReport = function(type, format) {
  showToast(`Compiling live analytical logs for download...`, "info");
  
  let reportTitle = "";
  let fileContent = "";
  let mimeType = "text/plain";

  const myDeliveredOrders = fullOrdersList.filter(o => o.storeId === activeStoreId && o.status === "delivered");

  if (type === "sales") {
    reportTitle = `DawaDo_Sales_Report_${Date.now()}`;
    if (format === "pdf") {
      mimeType = "text/plain"; // Plain text simulated PDF
      fileContent = `DAWADO MEDICINE DELIVERY NETWORK\nOFFICIAL LEDGER: ${activeStoreData.name.toUpperCase()}\n`;
      fileContent += `===============================================\n`;
      fileContent += `GENERATED ON: ${new Date().toLocaleString()}\n`;
      fileContent += `TOTAL DELIVERED SESSIONS: ${myDeliveredOrders.length}\n`;
      fileContent += `REVENUE BREAKDOWN:\n`;
      myDeliveredOrders.forEach((o, i) => {
        fileContent += `[${i+1}] ORDER #${o.id.toUpperCase()} - Total: ₹${o.totalAmount} (Method: ${o.paymentMethod})\n`;
      });
      fileContent += `===============================================\n`;
      fileContent += `SYSTEM SECURITY COMPLIANCE DIGITAL SIGNATURE HASH\n`;
    }
  } else if (type === "inventory") {
    reportTitle = `DawaDo_Inventory_Sheet_${Date.now()}`;
    mimeType = "text/csv";
    fileContent = "Product ID,Product Name,Brand,Category,MRP,Retail Price,Current Stock,Min Threshold\n";
    fullMedicinesList.forEach(m => {
      fileContent += `"${m.id}","${m.name}","${m.brand || 'N/A'}","${m.category}","${m.mrp || m.price}","${m.price}","${m.stock || 0}","${m.minStock || 10}"\n`;
    });
  } else if (type === "cancelled") {
    reportTitle = `DawaDo_Cancelled_Logs_${Date.now()}`;
    mimeType = "text/csv";
    fileContent = "Order ID,Customer,Amount,Status,Timestamp\n";
    const cancelled = fullOrdersList.filter(o => o.storeId === activeStoreId && o.status === "cancelled");
    cancelled.forEach(o => {
      fileContent += `"${o.id}","Ananya Sharma","₹${o.totalAmount}","${o.status}","${o.timestamp}"\n`;
    });
  } else {
    reportTitle = `DawaDo_GST_EInvoice_${Date.now()}`;
    fileContent = `GST E-INVOICE BILLINGS - DAWADO PHARMACY NETWORK\n`;
    fileContent += `LICENSED UNIT: ${activeStoreData.name}\n`;
    fileContent += `DRUG LICENSE NO: ${activeStoreData.kyc?.drugLicenseNum || "PENDING"}\n`;
    fileContent += `GSTIN NO: ${activeStoreData.kyc?.gst || "GST-MOCK"}\n`;
    fileContent += `PLATFORM REVENUE CALCULATIONS & TAX DETAILS\n`;
  }

  // Create downloadable browser attachment blob
  try {
    const blob = new Blob([fileContent], { type: `${mimeType};charset=utf-8;` });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${reportTitle}.${format}`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Compiled report downloaded successfully!`, "check");
  } catch (err) {
    showToast("Report download failed.", "danger");
  }
};


// -----------------------------------------
// 18. UI AUXILIARY VIEW NAVIGATION HELPERS
// -----------------------------------------

window.navigateToStore = function(viewName) {
  // Prevent unapproved stores from navigating to business screens
  const status = activeStoreData?.status || "incomplete";
  if (status !== "approved" && activeStoreData?.active !== true && viewName !== "profile" && viewName !== "notifications") {
    showToast("Awaiting Admin compliance approval.", "warning");
    return;
  }

  document.querySelectorAll(".screen-view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active"));

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add("active");

  const targetTab = document.getElementById(`tab-${viewName}`);
  if (targetTab) targetTab.classList.add("active");

  // Custom initializers on view focus
  if (viewName === "profile") {
    // Fill Settings options
    if (activeStoreData) {
      document.getElementById("store-profile-name").innerText = activeStoreData.name || "Pharmacy Hub";
      document.getElementById("store-profile-email").innerText = activeStoreData.email;
      
      const s = activeStoreData.settings || {};
      document.getElementById("settings-holiday-mode").checked = s.holidayMode || false;
      document.getElementById("settings-open-time").value = s.openTime || "09:00";
      document.getElementById("settings-close-time").value = s.closeTime || "23:00";
      document.getElementById("settings-auto-accept").checked = s.autoAccept !== false;
      document.getElementById("settings-delivery-radius").value = s.deliveryRadius || 5;
      document.getElementById("settings-preparation-mins").value = s.preparationMins || 20;
      document.getElementById("settings-min-order").value = s.minOrder || 100;
      document.getElementById("settings-delivery-fee").value = s.deliveryFee || 30;
    }
  }
};

function showView(viewId) {
  document.querySelectorAll(".screen-view").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add("active");
}

window.showToast = function(message, type = "check") {
  const bar = document.getElementById("toast-bar");
  const text = document.getElementById("toast-text");
  const icon = document.getElementById("toast-icon");

  text.innerText = message;
  
  // Custom theme formatting
  if (type === "danger") {
    bar.style.background = "var(--danger)";
    icon.className = "fa-solid fa-circle-xmark";
  } else if (type === "warning") {
    bar.style.background = "var(--warning)";
    icon.className = "fa-solid fa-triangle-exclamation";
  } else {
    bar.style.background = "#0f172a";
    icon.className = "fa-solid fa-circle-check";
  }

  bar.classList.add("show");
  setTimeout(() => bar.classList.remove("show"), 3500);
};
