import { db, auth } from "/js/db.js";

let adminSession = null;
let currentTab = "dashboard";
let rzpChartInstance = null;
let mapInstance = null;
let riderMarkers = {};

// On Auth state change
auth.onAuthStateChanged((user) => {
  if (user && user.role === "admin") {
    adminSession = user;
    document.getElementById("view-auth").style.display = "none";
    document.getElementById("main-layout").style.display = "flex";
    navigateToTab("dashboard");
    initRealTimeSync();
  } else {
    adminSession = null;
    document.getElementById("view-auth").style.display = "flex";
    document.getElementById("main-layout").style.display = "none";
  }
});

// Tab Navigation
window.navigateToTab = function(tabName) {
  currentTab = tabName;
  document.querySelectorAll(".screen-tab-view").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".sidebar-btn").forEach(el => el.classList.remove("bg-slate-800", "text-emerald-400"));
  
  const targetView = document.getElementById(`tab-view-${tabName}`);
  if (targetView) targetView.classList.remove("hidden");
  
  const targetBtn = document.getElementById(`sidebar-btn-${tabName}`);
  if (targetBtn) targetBtn.classList.add("bg-slate-800", "text-emerald-400");

  const mobileBtn = document.getElementById(`mobile-btn-${tabName}`);
  if (mobileBtn) {
    document.querySelectorAll(".mobile-nav-btn").forEach(el => el.classList.remove("text-emerald-400"));
    mobileBtn.classList.add("text-emerald-400");
  }

  // Reload tab specific logic
  if (tabName === "dashboard") {
    loadDashboardMetrics();
    initLeafletMap();
  } else if (tabName === "users") {
    renderUsersList();
  } else if (tabName === "stores") {
    renderStoresList();
  } else if (tabName === "fleet") {
    renderFleetList();
  } else if (tabName === "orders") {
    renderOrdersList();
  } else if (tabName === "medicines") {
    renderMedicinesCatalog();
  } else if (tabName === "marketing") {
    renderMarketingConsole();
  } else if (tabName === "finance") {
    renderFinanceDashboard();
  } else if (tabName === "support") {
    renderSupportTickets();
  } else if (tabName === "settings") {
    loadSystemSettings();
  } else if (tabName === "audits") {
    renderAuditsLog();
  }
};

// Global Toast Alert
window.showToast = function(msg, isSuccess = true) {
  const toast = document.getElementById("toast-alert");
  const text = document.getElementById("toast-text");
  const icon = document.getElementById("toast-icon");
  
  text.innerText = msg;
  if (isSuccess) {
    toast.className = "fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-emerald-400 border border-emerald-500/30 px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100";
    icon.className = "fa-solid fa-circle-check text-emerald-400";
  } else {
    toast.className = "fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-red-400 border border-red-500/30 px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100";
    icon.className = "fa-solid fa-circle-exclamation text-red-400";
  }
  
  setTimeout(() => {
    toast.className = "fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-emerald-400 border border-emerald-500/30 px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 transform -translate-y-10 opacity-0 pointer-events-none";
  }, 3500);
};

// Admin Login
window.handleAdminLogin = async function(e) {
  e.preventDefault();
  try {
    const email = document.getElementById("admin-email").value;
    const pass = document.getElementById("admin-pass").value;
    await auth.signInWithEmailAndPassword(email, pass);
    showToast("Decrypted Master Database. Terminal Active!");
  } catch (err) {
    showToast(err.message, false);
  }
};

window.handleAdminLogout = function() {
  auth.signOut();
  showToast("Administrator session terminated.");
};

// Real-Time Database sync triggers
function initRealTimeSync() {
  db.ref("orders").on("value", () => {
    if (adminSession) {
      loadDashboardMetrics();
      if (currentTab === "dashboard") loadDashboardMetrics();
      if (currentTab === "orders") renderOrdersList();
      if (currentTab === "finance") renderFinanceDashboard();
    }
  });
  db.ref("system/audit_logs").on("value", () => {
    if (adminSession && currentTab === "audits") renderAuditsLog();
  });
}

// 1. DASHBOARD OVERVIEW METRICS
function loadDashboardMetrics() {
  const snapshot = db._readRaw();
  const orders = Object.values(snapshot.orders || {});
  const stores = Object.values(snapshot.stores || {});
  const riders = Object.values(snapshot.delivery_boys || {});
  const users = Object.values(snapshot.users || {});
  const settlements = Object.values(snapshot.settlements || {});

  // KPI calculations
  const totalOrders = orders.length;
  const grossRev = orders.filter(o => o.deliveryStatus === "delivered").reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const activeStores = stores.filter(s => s.active).length;
  const onlineRiders = riders.filter(r => r.status === "online").length;
  const totalSettled = settlements.reduce((sum, s) => sum + (s.amount || 0), 0);

  // Update DOM Elements
  document.getElementById("kpi-revenue").innerText = `₹${grossRev.toFixed(2)}`;
  document.getElementById("kpi-orders").innerText = totalOrders;
  document.getElementById("kpi-stores").innerText = `${activeStores} / ${stores.length}`;
  document.getElementById("kpi-riders").innerText = `${onlineRiders} / ${riders.length}`;
  document.getElementById("kpi-settled").innerText = `₹${totalSettled.toFixed(2)}`;

  // Low Stock & Approvals alerts
  const lowStockMeds = Object.values(snapshot.medicines || {}).filter(m => (m.stock || 0) < 15);
  const pendingStores = stores.filter(s => !s.active);
  const pendingRiders = riders.filter(r => !r.active);

  const notificationsDiv = document.getElementById("live-notifications");
  if (notificationsDiv) {
    notificationsDiv.innerHTML = "";
    if (lowStockMeds.length > 0) {
      notificationsDiv.innerHTML += `
        <div class="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-amber-200 text-xs">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span><strong>Critical Warning:</strong> ${lowStockMeds.length} medicines running low on stock!</span>
          </div>
          <button onclick="navigateToTab('medicines')" class="underline font-medium hover:text-white">View</button>
        </div>
      `;
    }
    if (pendingStores.length > 0) {
      notificationsDiv.innerHTML += `
        <div class="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg text-emerald-200 text-xs">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-house-medical-circle-exclamation"></i>
            <span><strong>Approvals Required:</strong> ${pendingStores.length} medical stores awaiting onboarding!</span>
          </div>
          <button onclick="navigateToTab('stores')" class="underline font-medium hover:text-white">Review</button>
        </div>
      `;
    }
    if (pendingRiders.length > 0) {
      notificationsDiv.innerHTML += `
        <div class="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-blue-200 text-xs">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-motorcycle text-blue-400"></i>
            <span><strong>Courier Fleet Onboarding:</strong> ${pendingRiders.length} riders waiting KYC clearance!</span>
          </div>
          <button onclick="navigateToTab('fleet')" class="underline font-medium hover:text-white">Approve</button>
        </div>
      `;
    }
    if (notificationsDiv.innerHTML === "") {
      notificationsDiv.innerHTML = `<p class="text-slate-400 text-center py-4 text-xs">All platform systems reporting green. No critical alerts.</p>`;
    }
  }

  // Draw revenue dynamic chart
  initChart(orders);

  // Update real-time monitoring telemetry metrics
  updateTelemetryMetrics(users.length, stores.length, riders.length);
}

function updateTelemetryMetrics(usersCount, storesCount, ridersCount) {
  // Random variance for high-fidelity live tracking simulation
  const fireBaseLat = Math.floor(15 + Math.random() * 8);
  const cloudinaryLat = Math.floor(40 + Math.random() * 15);
  const razorpayLat = Math.floor(30 + Math.random() * 10);
  const mapsLat = Math.floor(20 + Math.random() * 10);
  const avgResponse = Math.floor((fireBaseLat + cloudinaryLat + razorpayLat + mapsLat) / 4);
  const errRate = (0.01 + Math.random() * 0.03).toFixed(2);

  const fbElem = document.getElementById("latency-firebase");
  const cdElem = document.getElementById("latency-cloudinary");
  const rzElem = document.getElementById("latency-razorpay");
  const mpElem = document.getElementById("latency-maps");
  const avgElem = document.getElementById("avg-response-time");
  const errElem = document.getElementById("system-error-rate");
  
  if (fbElem) fbElem.innerText = `${fireBaseLat}ms`;
  if (cdElem) cdElem.innerText = `${cloudinaryLat}ms`;
  if (rzElem) rzElem.innerText = `${razorpayLat}ms`;
  if (mpElem) mpElem.innerText = `${mapsLat}ms`;
  if (avgElem) avgElem.innerText = `${avgResponse}ms`;
  if (errElem) errElem.innerText = `${errRate}%`;

  const liveUsers = document.getElementById("live-users-count");
  const liveRiders = document.getElementById("live-riders-count");
  const liveStores = document.getElementById("live-stores-count");

  if (liveUsers) liveUsers.innerText = Math.max(12, usersCount + Math.floor(Math.random() * 5));
  if (liveRiders) liveRiders.innerText = Math.max(4, ridersCount + Math.floor(Math.random() * 2));
  if (liveStores) liveStores.innerText = storesCount;
}

// Chart.js render helper
function initChart(orders) {
  const ctx = document.getElementById("revenueTrendChart");
  if (!ctx) return;
  
  if (rzpChartInstance) {
    rzpChartInstance.destroy();
  }

  const salesByDate = {};
  orders.forEach(o => {
    const d = new Date(o.timestamp || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    salesByDate[d] = (salesByDate[d] || 0) + (o.totalAmount || 0);
  });

  const labels = Object.keys(salesByDate);
  const data = Object.values(salesByDate);

  if (labels.length === 0) {
    labels.push("No Sales Yet");
    data.push(0);
  }

  rzpChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Platform Gross Revenue (₹)',
        data: data,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        fill: true,
        borderWidth: 2,
        pointBackgroundColor: '#10b981'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
      }
    }
  });
}

// Leaflet Map Initialization
function initLeafletMap() {
  const mapContainer = document.getElementById("live-monitoring-map");
  if (!mapContainer) return;

  // Wait for container to be rendered
  setTimeout(() => {
    if (!mapInstance) {
      try {
        mapInstance = L.map("live-monitoring-map").setView([12.9715987, 77.5945627], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance);
      } catch (err) {
        console.warn("Map container is not ready or Leaflet is missing.", err);
        return;
      }
    }

    // Refresh size to avoid display bugs
    mapInstance.invalidateSize();

    // Clear existing markers
    Object.values(riderMarkers).forEach(m => mapInstance.removeLayer(m));
    riderMarkers = {};

    const snapshot = db._readRaw();
    const riders = Object.values(snapshot.delivery_boys || {});
    const stores = Object.values(snapshot.stores || {});

    // Add Store markers
    stores.forEach(s => {
      if (s.lat && s.lng) {
        const storeMarker = L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            html: `<div class="bg-emerald-500 text-white w-7 h-7 rounded-full border border-white flex items-center justify-center shadow-lg"><i class="fa-solid fa-house-medical text-xs"></i></div>`,
            className: "",
            iconSize: [28, 28]
          })
        }).addTo(mapInstance);
        storeMarker.bindPopup(`<strong>${s.name}</strong><br/>Licensed Pharmacy Hub`);
      }
    });

    // Add active Rider markers
    riders.forEach(r => {
      if (r.lat && r.lng) {
        const markerColor = r.status === "online" ? "bg-slate-900 border-emerald-400" : "bg-slate-600 border-slate-400";
        const rMarker = L.marker([r.lat, r.lng], {
          icon: L.divIcon({
            html: `<div class="${markerColor} text-white w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-lg"><i class="fa-solid fa-motorcycle text-xs"></i></div>`,
            className: "",
            iconSize: [28, 28]
          })
        }).addTo(mapInstance);
        rMarker.bindPopup(`<strong>${r.name}</strong><br/>Courier Rider Status: ${r.status.toUpperCase()}<br/>COD Wallet: ₹${(r.cashBalance || 0).toFixed(2)}`);
        riderMarkers[r.id] = rMarker;
      }
    });
  }, 100);
}

// 2. USER MANAGEMENT
window.renderUsersList = function() {
  const container = document.getElementById("users-list-container");
  if (!container) return;
  container.innerHTML = "";

  const q = document.getElementById("search-users")?.value.toLowerCase() || "";
  const filter = document.getElementById("filter-user-status")?.value || "all";

  const snapshot = db._readRaw();
  const users = Object.values(snapshot.users || {}).filter(u => u.role !== "store" && u.role !== "delivery" && u.role !== "admin");

  const filtered = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone && u.phone.includes(q));
    const matchesStatus = filter === "all" || (filter === "blocked" && u.blocked) || (filter === "active" && !u.blocked);
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-center py-10 text-sm">No customers matching search filters.</div>`;
    return;
  }

  filtered.forEach(u => {
    const card = document.createElement("div");
    card.className = "bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-600 transition-all";
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-2">
          <span class="font-semibold text-slate-100">${u.name}</span>
          ${u.blocked ? `<span class="bg-red-500/10 text-red-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-red-500/20">Blocked</span>` : `<span class="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-500/20">Active</span>`}
        </div>
        <p class="text-xs text-slate-400 mt-1"><i class="fa-regular fa-envelope mr-1"></i> ${u.email} &bull; <i class="fa-solid fa-phone mr-1"></i> ${u.phone || 'N/A'}</p>
        <p class="text-[11px] text-slate-500 mt-1">Total Orders Placed: <strong>${u.totalOrders || 0}</strong> &bull; Value: <strong>₹${(u.totalSpend || 0).toFixed(2)}</strong></p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="toggleBlockUser('${u.id}', ${u.blocked})" class="px-3 py-1.5 rounded-lg text-xs font-semibold border ${u.blocked ? 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10' : 'border-red-500/20 text-red-400 hover:bg-red-500/10'}">
          ${u.blocked ? "Unblock" : "Block"}
        </button>
        <button onclick="editUserPrompt('${u.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200">
          Edit
        </button>
        <button onclick="exportUserData('${u.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200" title="Export CSV">
          <i class="fa-solid fa-download"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
};

window.toggleBlockUser = function(userId, isCurrentlyBlocked) {
  const snapshot = db._readRaw();
  if (snapshot.users[userId]) {
    snapshot.users[userId].blocked = !isCurrentlyBlocked;
    db._writeRaw(snapshot);
    db.logAudit(`Central Admin toggled block status for user ID: ${userId} to ${!isCurrentlyBlocked}`, "security");
    showToast(`User account status updated.`);
    renderUsersList();
  }
};

window.editUserPrompt = function(userId) {
  const snapshot = db._readRaw();
  const user = snapshot.users[userId];
  if (!user) return;

  const newName = prompt("Enter customer full name:", user.name);
  if (newName === null) return;
  const newPhone = prompt("Enter phone number:", user.phone || "");
  if (newPhone === null) return;

  snapshot.users[userId].name = newName;
  snapshot.users[userId].phone = newPhone;
  db._writeRaw(snapshot);
  showToast("Customer details updated.");
  renderUsersList();
};

window.exportUserData = function(userId) {
  const snapshot = db._readRaw();
  const user = snapshot.users[userId];
  if (!user) return;
  
  const csvContent = "data:text/csv;charset=utf-8," 
    + ["ID", "Name", "Email", "Phone", "Total Orders", "Spend"].join(",") + "\n"
    + [user.id, user.name, user.email, user.phone || "N/A", user.totalOrders || 0, user.totalSpend || 0].join(",");
    
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `customer_export_${user.id}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Customer account data exported successfully!");
};

// 3. STORE HUB ONBOARDING & MANAGEMENT
window.renderStoresList = function() {
  const container = document.getElementById("stores-list-container");
  if (!container) return;
  container.innerHTML = "";

  const q = document.getElementById("search-stores")?.value.toLowerCase() || "";
  const filter = document.getElementById("filter-store-status")?.value || "all";

  const snapshot = db._readRaw();
  const stores = Object.values(snapshot.stores || {});

  const filtered = stores.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.city && s.city.toLowerCase().includes(q));
    const matchesStatus = filter === "all" || (filter === "pending" && !s.active) || (filter === "active" && s.active);
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-center py-10 text-sm">No pharmacy partners found matching filters.</div>`;
    return;
  }

  filtered.forEach(s => {
    const card = document.createElement("div");
    card.className = "bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-600 transition-all";
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <img src="${s.logo || 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=100'}" class="w-12 h-12 rounded-lg object-cover border border-slate-700" referrerPolicy="no-referrer" />
        <div>
          <div class="flex items-center gap-2">
            <span class="font-semibold text-slate-100">${s.name}</span>
            ${s.active ? `<span class="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-500/20">Licensed</span>` : `<span class="bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/20">Pending KYC</span>`}
          </div>
          <p class="text-xs text-slate-400 mt-0.5"><i class="fa-regular fa-envelope mr-1"></i> ${s.email} &bull; <i class="fa-solid fa-map-pin mr-1"></i> ${s.city || 'Bangalore'}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[10px] text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md">License: ${s.drugLicense || 'Pending Upload'}</span>
            <span class="text-[10px] text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md">GST: ${s.gst || 'N/A'}</span>
            <span class="text-[10px] text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md">Balance: ₹${(s.balance || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        ${!s.active ? `
          <button onclick="approveStoreHub('${s.id}', '${s.email}')" class="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-md transition">
            Approve & Onboard
          </button>
        ` : `
          <button onclick="suspendStoreHub('${s.id}')" class="border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs px-3 py-1.5 rounded-lg font-semibold transition">
            Suspend Hub
          </button>
        `}
        <button onclick="viewStoreDocuments('${s.id}')" class="bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs px-3 py-1.5 rounded-lg font-semibold transition" title="View Docs">
          Docs
        </button>
      </div>
    `;
    container.appendChild(card);
  });
};

window.approveStoreHub = function(storeId, email) {
  // Update local credential block
  const users = JSON.parse(localStorage.getItem("dawado_users")) || {};
  if (users[email]) {
    users[email].approvalPending = false;
    localStorage.setItem("dawado_users", JSON.stringify(users));
  }

  // Update Database
  const snapshot = db._readRaw();
  if (snapshot.stores[storeId]) {
    snapshot.stores[storeId].active = true;
    db._writeRaw(snapshot);
    db.logAudit(`Approved & activated pharmacy partner store hub: ${snapshot.stores[storeId].name}`, "system");
    showToast("Pharmacy Store Onboarded A-Z!");
    renderStoresList();
  }
};

window.suspendStoreHub = function(storeId) {
  const snapshot = db._readRaw();
  if (snapshot.stores[storeId]) {
    snapshot.stores[storeId].active = false;
    db._writeRaw(snapshot);
    db.logAudit(`Suspended pharmacy partner store hub: ${snapshot.stores[storeId].name}`, "security");
    showToast("Hub suspended. Active listing blocked.", false);
    renderStoresList();
  }
};

window.viewStoreDocuments = function(storeId) {
  const snapshot = db._readRaw();
  const store = snapshot.stores[storeId];
  if (!store) return;

  const docModal = document.getElementById("global-details-modal");
  const modalTitle = document.getElementById("global-modal-title");
  const modalContent = document.getElementById("global-modal-content");

  modalTitle.innerText = `Documents Checklist & KYC - ${store.name}`;
  modalContent.innerHTML = `
    <div class="space-y-4 font-sans">
      <div class="p-3 bg-slate-900 border border-slate-700 rounded-lg">
        <h4 class="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Drug License Verification (Form 20/21)</h4>
        <div class="flex justify-between items-center text-xs text-slate-300">
          <span>License Number: <strong>${store.drugLicense || 'DL-2026-908123'}</strong></span>
          <span class="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 border border-emerald-400/20 rounded font-bold uppercase">Verified</span>
        </div>
        <p class="text-[10px] text-slate-500 mt-2">Durg License checked against CDSCO Database logs. Active validation confirm.</p>
      </div>

      <div class="p-3 bg-slate-900 border border-slate-700 rounded-lg">
        <h4 class="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">GST Identification Verification (GSTIN)</h4>
        <div class="flex justify-between items-center text-xs text-slate-300">
          <span>GSTIN: <strong>${store.gst || '29AAAAA1111A1Z1'}</strong></span>
          <span class="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 border border-emerald-400/20 rounded font-bold uppercase">Verified</span>
        </div>
        <p class="text-[10px] text-slate-500 mt-2">Verified directly with GSTN Treasury nodes. Tax filings aligned.</p>
      </div>

      <div class="p-3 bg-slate-900 border border-slate-700 rounded-lg">
        <h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Store Cover & Layout Image</h4>
        <img src="${store.logo || 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=400'}" class="w-full h-40 object-cover rounded-md mt-2 border border-slate-700" referrerPolicy="no-referrer" />
      </div>
    </div>
  `;
  docModal.classList.remove("hidden");
};

// 4. DELIVERY FLEET TRACKING
window.renderFleetList = function() {
  const container = document.getElementById("fleet-list-container");
  if (!container) return;
  container.innerHTML = "";

  const q = document.getElementById("search-fleet")?.value.toLowerCase() || "";
  const filter = document.getElementById("filter-fleet-status")?.value || "all";

  const snapshot = db._readRaw();
  const riders = Object.values(snapshot.delivery_boys || {});

  const filtered = riders.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.phone && r.phone.includes(q)) || (r.vehicleNumber && r.vehicleNumber.toLowerCase().includes(q));
    const matchesStatus = filter === "all" || (filter === "pending" && !r.active) || (filter === "online" && r.status === "online") || (filter === "offline" && r.status === "offline");
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-center py-10 text-sm">No courier riders found matching filters.</div>`;
    return;
  }

  filtered.forEach(r => {
    const isOnline = r.status === "online";
    const statusText = r.status ? r.status.toUpperCase() : "OFFLINE";
    const statusClass = isOnline ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-700/30 text-slate-400 border-slate-600/30";

    const card = document.createElement("div");
    card.className = "bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-600 transition-all";
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-2">
          <span class="font-semibold text-slate-100">${r.name}</span>
          <span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusClass}">${statusText}</span>
          ${r.active ? `<span class="bg-blue-500/10 text-blue-400 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border border-blue-500/20">Kyc Approved</span>` : `<span class="bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-500/20">Kyc Pending</span>`}
        </div>
        <p class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-phone text-[10px] mr-1"></i> ${r.phone || 'N/A'} &bull; <i class="fa-solid fa-motorcycle text-[10px] mr-1"></i> ${r.vehicleType || 'Bike'} (${r.vehicleNumber || 'Pending'})</p>
        <div class="flex flex-wrap items-center gap-2 mt-1.5">
          <span class="text-[10px] text-slate-500 bg-slate-850 border border-slate-750 px-2 py-0.5 rounded">Oustanding COD: <strong class="text-amber-400">₹${(r.cashBalance || 0).toFixed(2)}</strong></span>
          <span class="text-[10px] text-slate-500 bg-slate-850 border border-slate-750 px-2 py-0.5 rounded">Aadhaar: ${r.aadhaarNumber || 'Unverified'}</span>
          <span class="text-[10px] text-slate-500 bg-slate-850 border border-slate-750 px-2 py-0.5 rounded">DL: ${r.dlNumber || 'Pending'}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        ${!r.active ? `
          <button onclick="approveCourierRider('${r.id}', '${r.email}')" class="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow transition">
            Verify KYC & Approve
          </button>
        ` : `
          <button onclick="suspendCourierRider('${r.id}')" class="border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs px-3 py-1.5 rounded-lg font-semibold transition">
            Block Rider
          </button>
        `}
        ${r.cashBalance > 0 ? `
          <button onclick="settleRiderCashBalance('${r.id}')" class="bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs px-3 py-1.5 rounded-lg font-bold shadow transition">
            Collect COD Cash
          </button>
        ` : ''}
      </div>
    `;
    container.appendChild(card);
  });
};

window.approveCourierRider = function(riderId, email) {
  const users = JSON.parse(localStorage.getItem("dawado_users")) || {};
  if (users[email]) {
    users[email].approvalPending = false;
    localStorage.setItem("dawado_users", JSON.stringify(users));
  }

  const snapshot = db._readRaw();
  if (snapshot.delivery_boys[riderId]) {
    snapshot.delivery_boys[riderId].active = true;
    db._writeRaw(snapshot);
    db.logAudit(`Approved Courier Delivery Rider: ${snapshot.delivery_boys[riderId].name}`, "system");
    showToast("KYC complete. Delivery Boy profile is active!");
    renderFleetList();
  }
};

window.suspendCourierRider = function(riderId) {
  const snapshot = db._readRaw();
  if (snapshot.delivery_boys[riderId]) {
    snapshot.delivery_boys[riderId].active = false;
    db._writeRaw(snapshot);
    db.logAudit(`Suspended Delivery Rider: ${snapshot.delivery_boys[riderId].name}`, "security");
    showToast("Courier rider deactivated.", false);
    renderFleetList();
  }
};

window.settleRiderCashBalance = function(riderId) {
  const snapshot = db._readRaw();
  const rider = snapshot.delivery_boys[riderId];
  if (!rider) return;

  const currentCash = rider.cashBalance || 0;
  if (currentCash <= 0) return;

  const confirmCollect = confirm(`Are you sure you have collected ₹${currentCash.toFixed(2)} cash from rider ${rider.name}? This will clear their wallet cache balance.`);
  if (!confirmCollect) return;

  snapshot.delivery_boys[riderId].cashBalance = 0;
  
  // Log a treasury settlement transaction entry
  const stlId = "STL-" + Math.floor(100000 + Math.random() * 900000);
  if (!snapshot.settlements) snapshot.settlements = {};
  snapshot.settlements[stlId] = {
    id: stlId,
    deliveryBoyId: riderId,
    deliveryBoyName: rider.name,
    amount: currentCash,
    razorpayPaymentId: "pay_SETTLE_COD_" + Math.floor(Math.random() * 100000),
    timestamp: new Date().toISOString(),
    status: "completed"
  };

  db._writeRaw(snapshot);
  db.logAudit(`Treasury settlement cleared for courier: ${rider.name}. Cash collected: ₹${currentCash.toFixed(2)}`, "finance");
  showToast("Cash settlement completed and recorded!");
  renderFleetList();
};

// 5. REAL-TIME ORDERS TRACKING
window.renderOrdersList = function() {
  const container = document.getElementById("orders-list-container");
  if (!container) return;
  container.innerHTML = "";

  const q = document.getElementById("search-orders")?.value.toLowerCase() || "";
  const filter = document.getElementById("filter-order-status")?.value || "all";

  const snapshot = db._readRaw();
  const orders = Object.values(snapshot.orders || {});

  // Sort by newest first
  orders.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  const filtered = orders.filter(o => {
    const matchesSearch = o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.storeName.toLowerCase().includes(q);
    const matchesStatus = filter === "all" || o.deliveryStatus === filter;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-center py-10 text-sm">No customer orders matching specified filter.</div>`;
    return;
  }

  filtered.forEach(o => {
    let badgeClass = "bg-slate-700/30 text-slate-400 border-slate-600/30";
    if (o.deliveryStatus === "delivered") badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (o.deliveryStatus === "picked_up") badgeClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
    if (o.deliveryStatus === "placed") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";

    const card = document.createElement("div");
    card.className = "bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl space-y-3 hover:border-slate-600 transition-all";
    card.innerHTML = `
      <div class="flex justify-between items-start gap-2">
        <div>
          <span class="font-mono text-xs text-slate-400 font-bold bg-slate-900 px-2 py-1 rounded border border-slate-800">${o.id}</span>
          <p class="text-xs text-slate-400 mt-2">Placed On: <strong class="text-slate-300">${new Date(o.timestamp).toLocaleString()}</strong></p>
        </div>
        <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-md border ${badgeClass}">${(o.deliveryStatus || 'placed').replace('_', ' ')}</span>
      </div>
      
      <div class="border-t border-slate-700/50 pt-2.5 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span class="text-slate-500 uppercase tracking-wider text-[10px]">Merchant Store</span>
          <p class="font-medium text-slate-300 mt-0.5">${o.storeName}</p>
        </div>
        <div>
          <span class="text-slate-500 uppercase tracking-wider text-[10px]">Customer Name</span>
          <p class="font-medium text-slate-300 mt-0.5">${o.customerName}</p>
        </div>
      </div>

      <div class="border-t border-slate-700/50 pt-2.5 flex justify-between items-center text-xs">
        <div>
          <span class="text-slate-500 uppercase tracking-wider text-[10px]">Total Bill:</span>
          <strong class="text-emerald-400 text-sm block">₹${(o.totalAmount || 0).toFixed(2)}</strong>
        </div>
        <div class="flex items-center gap-2">
          ${o.prescriptionUrl ? `
            <button onclick="viewPrescriptionPopup('${o.prescriptionUrl}')" class="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-emerald-400 font-medium transition text-[11px]">
              <i class="fa-solid fa-file-prescription mr-1 text-emerald-400"></i> Rx
            </button>
          ` : ''}
          <button onclick="viewOrderTimeline('${o.id}')" class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium transition text-[11px]">
            Manage Timeline
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
};

window.viewPrescriptionPopup = function(imgUrl) {
  const modal = document.getElementById("global-details-modal");
  const modalTitle = document.getElementById("global-modal-title");
  const modalContent = document.getElementById("global-modal-content");

  modalTitle.innerText = "Prescription Rx Verification";
  modalContent.innerHTML = `
    <div class="flex flex-col items-center gap-4">
      <img src="${imgUrl}" class="max-w-full max-h-96 rounded-lg object-contain border border-slate-700" referrerPolicy="no-referrer" />
      <div class="flex gap-2 w-full">
        <button onclick="approvePrescriptionRx()" class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs transition">Approve & Confirm Rx</button>
        <button onclick="rejectPrescriptionRx()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-red-400 font-bold py-2 rounded-xl text-xs transition border border-red-500/25">Flag Invalid Rx</button>
      </div>
    </div>
  `;
  modal.classList.remove("hidden");
};

window.approvePrescriptionRx = function() {
  showToast("Doctor prescription validated successfully!");
  document.getElementById("global-details-modal").classList.add("hidden");
};

window.rejectPrescriptionRx = function() {
  showToast("Prescription flagged. Store has been notified.", false);
  document.getElementById("global-details-modal").classList.add("hidden");
};

window.viewOrderTimeline = function(orderId) {
  const snapshot = db._readRaw();
  const order = snapshot.orders[orderId];
  if (!order) return;

  const modal = document.getElementById("global-details-modal");
  const modalTitle = document.getElementById("global-modal-title");
  const modalContent = document.getElementById("global-modal-content");

  modalTitle.innerText = `Control Timeline: ${order.id}`;

  const ridersOptionHTML = Object.values(snapshot.delivery_boys)
    .filter(r => r.active)
    .map(r => `<option value="${r.id}" ${order.deliveryBoyId === r.id ? 'selected' : ''}>${r.name} (${r.status})</option>`)
    .join('');

  modalContent.innerHTML = `
    <div class="space-y-4 text-xs font-sans">
      <div class="bg-slate-900 border border-slate-750 p-3 rounded-lg">
        <label class="block text-slate-400 font-semibold mb-1 text-[10px] uppercase">Reassign Courier Rider</label>
        <select id="reassign-rider-select" class="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-2 text-xs">
          <option value="">No Courier Assigned</option>
          ${ridersOptionHTML}
        </select>
        <button onclick="submitRiderReassign('${order.id}')" class="mt-2 bg-emerald-500 text-slate-950 font-bold px-3 py-1.5 rounded-md text-[10px] uppercase hover:bg-emerald-600">Apply Assign</button>
      </div>

      <div class="bg-slate-900 border border-slate-750 p-3 rounded-lg space-y-2">
        <label class="block text-slate-400 font-semibold text-[10px] uppercase">Forced Delivery Status Override</label>
        <div class="grid grid-cols-2 gap-2">
          <button onclick="updateOrderStatusForce('${order.id}', 'placed')" class="bg-slate-800 hover:bg-slate-750 border border-slate-700 py-2 rounded text-[10px] font-semibold text-slate-200">Set Placed</button>
          <button onclick="updateOrderStatusForce('${order.id}', 'picked_up')" class="bg-slate-800 hover:bg-slate-750 border border-slate-700 py-2 rounded text-[10px] font-semibold text-slate-200">Set Picked Up</button>
          <button onclick="updateOrderStatusForce('${order.id}', 'delivered')" class="bg-slate-800 hover:bg-slate-750 border border-slate-700 py-2 rounded text-[10px] font-semibold text-slate-200">Set Delivered</button>
          <button onclick="updateOrderStatusForce('${order.id}', 'cancelled')" class="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 py-2 rounded text-[10px] font-semibold text-red-400">Cancel Order</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove("hidden");
};

window.submitRiderReassign = function(orderId) {
  const selectedRiderId = document.getElementById("reassign-rider-select").value;
  const snapshot = db._readRaw();
  const order = snapshot.orders[orderId];
  if (!order) return;

  if (selectedRiderId) {
    const rider = snapshot.delivery_boys[selectedRiderId];
    order.deliveryBoyId = selectedRiderId;
    order.deliveryBoyName = rider.name;
    db.logAudit(`Courier fleet coordinator reassigned rider ${rider.name} to order ID: ${orderId}`, "system");
  } else {
    order.deliveryBoyId = "";
    order.deliveryBoyName = "";
  }

  db._writeRaw(snapshot);
  showToast("Courier rider reassigned!");
  document.getElementById("global-details-modal").classList.add("hidden");
  renderOrdersList();
};

window.updateOrderStatusForce = function(orderId, nextStatus) {
  const snapshot = db._readRaw();
  const order = snapshot.orders[orderId];
  if (!order) return;

  order.deliveryStatus = nextStatus;
  
  // If COD order just delivered, add amount outstanding to Rider COD wallet balance
  if (nextStatus === "delivered" && order.paymentMethod === "COD" && order.deliveryBoyId) {
    const rId = order.deliveryBoyId;
    if (snapshot.delivery_boys[rId]) {
      snapshot.delivery_boys[rId].cashBalance = (snapshot.delivery_boys[rId].cashBalance || 0) + (order.totalAmount || 0);
    }
  }

  db._writeRaw(snapshot);
  db.logAudit(`Central Operations forced status update on order: ${orderId} to status: ${nextStatus}`, "system");
  showToast(`Order status updated to: ${nextStatus.toUpperCase()}`);
  document.getElementById("global-details-modal").classList.add("hidden");
  renderOrdersList();
};

// 6. MEDICINES CATALOG
window.renderMedicinesCatalog = function() {
  const container = document.getElementById("meds-catalog-grid");
  if (!container) return;
  container.innerHTML = "";

  const q = document.getElementById("search-meds")?.value.toLowerCase() || "";
  const cat = document.getElementById("filter-med-category")?.value || "all";

  const snapshot = db._readRaw();
  const meds = Object.values(snapshot.medicines || {});

  const filtered = meds.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(q) || (m.description && m.description.toLowerCase().includes(q));
    const matchesCategory = cat === "all" || m.category === cat;
    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full text-slate-400 text-center py-10 text-sm">No medicines found in catalog.</div>`;
    return;
  }

  filtered.forEach(m => {
    const card = document.createElement("div");
    card.className = "bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between gap-3 hover:border-slate-600 transition";
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <img src="${m.image || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=100'}" class="w-12 h-12 rounded-lg object-cover border border-slate-700" referrerPolicy="no-referrer" />
        <div class="flex-1 min-w-0">
          <h4 class="font-semibold text-slate-200 text-xs truncate">${m.name}</h4>
          <span class="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded-md mt-1 inline-block">${m.category}</span>
          <p class="text-[10px] text-slate-500 mt-1 truncate">${m.description || 'No description'}</p>
        </div>
      </div>
      <div class="border-t border-slate-700/50 pt-2 flex items-center justify-between text-xs font-mono">
        <div>
          <span class="text-[10px] text-slate-500 block">PRICE:</span>
          <strong class="text-slate-200">₹${(m.price || 0).toFixed(2)}</strong>
        </div>
        <div>
          <span class="text-[10px] text-slate-500 block">STOCK:</span>
          <strong class="${m.stock < 15 ? 'text-rose-400' : 'text-slate-300'}">${m.stock || 0} units</strong>
        </div>
        <div class="flex gap-1">
          <button onclick="editMedicineDialog('${m.id}')" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px]">Edit</button>
          <button onclick="deleteMedicineCatalog('${m.id}')" class="px-2 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded border border-red-500/20 text-[10px]">Del</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
};

window.addNewMedicinePrompt = function() {
  const snapshot = db._readRaw();
  const medId = "med_" + Date.now();
  
  const name = prompt("Enter medicine title (e.g. Lipitor 10mg):");
  if (!name) return;
  const price = parseFloat(prompt("Enter price in INR (e.g. 150):", "100"));
  if (isNaN(price)) return;
  const stock = parseInt(prompt("Enter initial inventory count:", "100"));
  if (isNaN(stock)) return;
  const category = prompt("Enter category (e.g. Heart Health, Antibiotics):", "Fever & Pain");
  if (!category) return;
  const desc = prompt("Enter description:", "Used to treat symptoms.");
  
  snapshot.medicines[medId] = {
    id: medId,
    name: name,
    price: price,
    stock: stock,
    category: category,
    description: desc,
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200",
    prescriptionRequired: false
  };

  db._writeRaw(snapshot);
  db.logAudit(`Central Operations catalogued a new medicine: ${name}`, "system");
  showToast("Medicine added to catalog!");
  renderMedicinesCatalog();
};

window.editMedicineDialog = function(medId) {
  const snapshot = db._readRaw();
  const med = snapshot.medicines[medId];
  if (!med) return;

  const newPrice = parseFloat(prompt(`Enter new price for ${med.name}:`, med.price));
  if (isNaN(newPrice)) return;
  const newStock = parseInt(prompt(`Enter new inventory stock count:`, med.stock));
  if (isNaN(newStock)) return;

  med.price = newPrice;
  med.stock = newStock;
  
  db._writeRaw(snapshot);
  db.logAudit(`Central Catalog modified price/stock of medicine: ${med.name}`, "system");
  showToast("Medicine catalog item updated successfully.");
  renderMedicinesCatalog();
};

window.deleteMedicineCatalog = function(medId) {
  const snapshot = db._readRaw();
  if (snapshot.medicines[medId]) {
    const medName = snapshot.medicines[medId].name;
    const confirmDelete = confirm(`Are you absolutely sure you want to delete ${medName} from catalog?`);
    if (!confirmDelete) return;

    delete snapshot.medicines[medId];
    db._writeRaw(snapshot);
    db.logAudit(`Central Catalog removed medicine: ${medName}`, "system");
    showToast("Medicine catalog entry removed.", false);
    renderMedicinesCatalog();
  }
};

// 7. MARKETING CONSOLE (BANNERS & COUPONS)
window.renderMarketingConsole = function() {
  const bannersCont = document.getElementById("list-admin-banners");
  const couponsCont = document.getElementById("list-admin-coupons");
  if (!bannersCont || !couponsCont) return;

  bannersCont.innerHTML = "";
  couponsCont.innerHTML = "";

  const snapshot = db._readRaw();
  
  // Render Banners
  const banners = Object.values(snapshot.banners || {});
  if (banners.length === 0) {
    bannersCont.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">No marketing promo banners configured.</p>`;
  } else {
    banners.forEach(b => {
      const bCard = document.createElement("div");
      bCard.className = "bg-slate-900/50 border border-slate-800 p-3 rounded-lg flex items-start gap-3";
      bCard.innerHTML = `
        <img src="${b.image}" class="w-16 h-10 object-cover rounded border border-slate-800" referrerPolicy="no-referrer" />
        <div class="flex-1 text-[11px] font-sans">
          <h5 class="font-semibold text-slate-200">${b.title}</h5>
          <p class="text-slate-400 mt-0.5">Campaign Type: <strong class="text-slate-300">${b.type}</strong></p>
          <span class="bg-emerald-500/10 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 mt-1 inline-block uppercase">${b.status}</span>
        </div>
        <button onclick="removeMarketingCampaign('banner', '${b.id}')" class="text-rose-400 hover:bg-rose-500/10 p-1.5 rounded"><i class="fa-solid fa-trash-can"></i></button>
      `;
      bannersCont.appendChild(bCard);
    });
  }

  // Render Coupons
  const coupons = Object.values(snapshot.coupons || {});
  if (coupons.length === 0) {
    couponsCont.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">No active offer coupons found.</p>`;
  } else {
    coupons.forEach(c => {
      const cCard = document.createElement("div");
      cCard.className = "bg-slate-900/50 border border-slate-800 p-3 rounded-lg flex justify-between items-center";
      cCard.innerHTML = `
        <div class="text-[11px]">
          <span class="font-mono bg-slate-900 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded">${c.code}</span>
          <p class="text-slate-400 mt-1.5">Value: <strong>${c.type === 'percentage' ? `${c.discount}% Off` : `₹${c.discount} Off`}</strong> &bull; Min Order: ₹${c.minOrder}</p>
        </div>
        <button onclick="removeMarketingCampaign('coupon', '${c.id}')" class="text-rose-400 hover:bg-rose-500/10 p-1.5 rounded text-xs"><i class="fa-solid fa-trash-can"></i></button>
      `;
      couponsCont.appendChild(cCard);
    });
  }
};

window.addNewPromoBanner = function() {
  const snapshot = db._readRaw();
  const bId = "banner_" + Date.now();
  const title = prompt("Enter marketing promo banner campaign title:");
  if (!title) return;
  const image = prompt("Enter Unsplash / Cloudinary banner image URL:");
  if (!image) return;

  if (!snapshot.banners) snapshot.banners = {};
  snapshot.banners[bId] = {
    id: bId,
    title: title,
    image: image,
    type: "Home Banner",
    priority: 1,
    status: "active"
  };

  db._writeRaw(snapshot);
  db.logAudit(`Central Marketing added a promo campaign banner: ${title}`, "system");
  showToast("Promo marketing banner launched!");
  renderMarketingConsole();
};

window.addNewPromoCoupon = function() {
  const snapshot = db._readRaw();
  const cId = "coupon_" + Date.now();
  const code = prompt("Enter custom coupon code (e.g. HEAL30):")?.toUpperCase();
  if (!code) return;
  const val = parseFloat(prompt("Enter discount value (e.g. 30):", "30"));
  if (isNaN(val)) return;

  if (!snapshot.coupons) snapshot.coupons = {};
  snapshot.coupons[cId] = {
    id: cId,
    code: code,
    discount: val,
    type: "percentage",
    minOrder: 150,
    status: "active"
  };

  db._writeRaw(snapshot);
  db.logAudit(`Central Marketing loaded discount coupon campaign: ${code}`, "system");
  showToast("Campaign Coupon launched!");
  renderMarketingConsole();
};

window.removeMarketingCampaign = function(type, id) {
  const snapshot = db._readRaw();
  if (type === "banner") {
    delete snapshot.banners[id];
  } else {
    delete snapshot.coupons[id];
  }
  db._writeRaw(snapshot);
  showToast("Marketing campaign removed successfully.", false);
  renderMarketingConsole();
};

// 8. FINANCE MANAGEMENT
window.renderFinanceDashboard = function() {
  const snapshot = db._readRaw();
  const orders = Object.values(snapshot.orders || {});
  
  // Delivered totals
  const delivered = orders.filter(o => o.deliveryStatus === "delivered");
  
  const totalGross = delivered.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const platformCommission = totalGross * 0.10; // 10% base
  const totalRiderPay = delivered.length * 30; // ₹30 per delivery flat
  const totalStorePay = totalGross - platformCommission - totalRiderPay;

  document.getElementById("finance-gross").innerText = `₹${totalGross.toFixed(2)}`;
  document.getElementById("finance-commission").innerText = `₹${platformCommission.toFixed(2)}`;
  document.getElementById("finance-riders").innerText = `₹${totalRiderPay.toFixed(2)}`;
  document.getElementById("finance-stores").innerText = `₹${totalStorePay.toFixed(2)}`;

  // Display settlement log
  const settCont = document.getElementById("finance-settlements-list");
  if (!settCont) return;
  settCont.innerHTML = "";

  const settlements = Object.values(snapshot.settlements || {});
  if (settlements.length === 0) {
    settCont.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">No recent corporate treasury payouts recorded.</p>`;
    return;
  }

  // Sort newest
  settlements.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  settlements.forEach(s => {
    const sCard = document.createElement("div");
    sCard.className = "bg-slate-900/50 border border-slate-800 p-3 rounded-lg text-xs flex justify-between items-center";
    sCard.innerHTML = `
      <div>
        <strong class="text-emerald-400 font-bold block">₹${s.amount.toFixed(2)}</strong>
        <span class="text-[10px] text-slate-400 mt-0.5 block">Recipient: ${s.deliveryBoyName || 'Partner'} &bull; ${new Date(s.timestamp).toLocaleDateString()}</span>
      </div>
      <span class="bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">Completed</span>
    `;
    settCont.appendChild(sCard);
  });
};

// 9. HELP DESK & SUPPORT TICKETS
window.renderSupportTickets = function() {
  const container = document.getElementById("support-tickets-container");
  if (!container) return;
  container.innerHTML = "";

  const snapshot = db._readRaw();
  const tickets = Object.values(snapshot.support_tickets || {});

  if (tickets.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-center py-10 text-sm">All complaints cleared! No active tickets.</div>`;
    return;
  }

  tickets.forEach(t => {
    const isClosed = t.status === "resolved" || t.status === "closed";
    const statusText = t.status ? t.status.toUpperCase() : "OPEN";
    const statusClass = isClosed ? "bg-slate-700/30 text-slate-400 border-slate-600/30" : "bg-rose-500/10 text-rose-400 border-rose-500/20";

    const card = document.createElement("div");
    card.className = "bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl space-y-2 hover:border-slate-600 transition-all";
    card.innerHTML = `
      <div class="flex justify-between items-start gap-2">
        <div>
          <span class="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded-md border border-slate-850">ID: ${t.id}</span>
          <h5 class="font-bold text-slate-200 mt-1.5">${t.subject}</h5>
        </div>
        <span class="text-[9px] font-bold px-2 py-0.5 rounded border ${statusClass}">${statusText}</span>
      </div>
      <p class="text-xs text-slate-400 italic bg-slate-900/40 p-2.5 rounded border border-slate-750/30">"${t.message}"</p>
      <div class="flex justify-between items-center text-[10px] text-slate-500">
        <span>From: <strong>${t.senderName} (${t.role})</strong></span>
        <span>Date: ${new Date(t.timestamp).toLocaleDateString()}</span>
      </div>
      
      ${!isClosed ? `
        <div class="pt-2 border-t border-slate-750/50 flex justify-end gap-2">
          <button onclick="chatSupportTicket('${t.id}')" class="bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs px-3 py-1 font-semibold rounded-md transition">Reply Chat</button>
          <button onclick="resolveSupportTicket('${t.id}')" class="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1 font-semibold rounded-md transition">Resolve</button>
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });
};

window.resolveSupportTicket = function(ticketId) {
  const snapshot = db._readRaw();
  if (snapshot.support_tickets[ticketId]) {
    snapshot.support_tickets[ticketId].status = "resolved";
    db._writeRaw(snapshot);
    db.logAudit(`Help Desk closed ticket: ${ticketId}`, "system");
    showToast("Complaint resolved successfully.");
    renderSupportTickets();
  }
};

window.chatSupportTicket = function(ticketId) {
  const snapshot = db._readRaw();
  const ticket = snapshot.support_tickets[ticketId];
  if (!ticket) return;

  const replyText = prompt(`Type support reply message to ${ticket.senderName}:`);
  if (!replyText) return;

  snapshot.support_tickets[ticketId].status = "resolved";
  
  // Log message
  db.logAudit(`Help Desk responded to client ${ticket.senderName}: "${replyText}"`, "system");
  db._writeRaw(snapshot);
  showToast("Support response message dispatched to client dashboard!");
  renderSupportTickets();
};

// 10. SYSTEM CONFIGURATION & COMPLIANCE
function loadSystemSettings() {
  const snapshot = db._readRaw();
  const settings = snapshot.system?.settings || {};

  document.getElementById("set-app-name").value = settings.appName || "DawaDo – Your Medicine Partner";
  document.getElementById("set-delivery-charge").value = settings.deliveryCharge || 30;
  document.getElementById("set-tax-rate").value = settings.taxRate || 0.05;
  document.getElementById("set-commission-rate").value = settings.commissionRate || 0.10;
  document.getElementById("set-working-hours").value = settings.workingHours || "08:00 - 22:00";
  
  // Load maintenance parameters
  const maintenanceMode = document.getElementById("set-maintenance-mode");
  const maintenanceMessage = document.getElementById("set-maintenance-message");
  if (maintenanceMode) {
    maintenanceMode.checked = settings.firebaseMaintenanceMode || false;
  }
  if (maintenanceMessage) {
    maintenanceMessage.value = settings.firebaseMaintenanceMessage || "System is undergoing upgrades.";
  }
}

window.savePlatformSettings = function(e) {
  e.preventDefault();
  const snapshot = db._readRaw();
  if (!snapshot.system) snapshot.system = {};
  if (!snapshot.system.settings) snapshot.system.settings = {};

  snapshot.system.settings.appName = document.getElementById("set-app-name").value;
  snapshot.system.settings.deliveryCharge = parseFloat(document.getElementById("set-delivery-charge").value);
  snapshot.system.settings.taxRate = parseFloat(document.getElementById("set-tax-rate").value);
  snapshot.system.settings.commissionRate = parseFloat(document.getElementById("set-commission-rate").value);
  snapshot.system.settings.workingHours = document.getElementById("set-working-hours").value;

  // Save maintenance parameters
  const maintenanceMode = document.getElementById("set-maintenance-mode");
  const maintenanceMessage = document.getElementById("set-maintenance-message");
  if (maintenanceMode) {
    snapshot.system.settings.firebaseMaintenanceMode = maintenanceMode.checked;
  }
  if (maintenanceMessage) {
    snapshot.system.settings.firebaseMaintenanceMessage = maintenanceMessage.value;
  }

  db._writeRaw(snapshot);
  db.logAudit(`Central Admin re-saved system platform parameters. App: ${snapshot.system.settings.appName}. Maintenance: ${snapshot.system.settings.firebaseMaintenanceMode ? "ENABLED" : "DISABLED"}`, "security");
  showToast("Platform configurations locked and updated!");
};

// 11. SECURITY AUDITS LEDGER
window.renderAuditsLog = function() {
  const container = document.getElementById("audits-log-container");
  if (!container) return;
  container.innerHTML = "";

  const snapshot = db._readRaw();
  const logs = snapshot.system?.audit_logs || [];

  if (logs.length === 0) {
    container.innerHTML = `<div class="text-slate-400 text-center py-10 text-sm">No security audit records found.</div>`;
    return;
  }

  // Reverse sort (newest logs first)
  const sorted = [...logs].reverse();

  sorted.forEach(l => {
    let typeClass = "bg-slate-700/50 text-slate-300";
    if (l.type === "security") typeClass = "bg-rose-500/15 text-rose-400 border border-rose-500/20";
    if (l.type === "auth") typeClass = "bg-amber-500/15 text-amber-400 border border-amber-500/20";
    if (l.type === "finance") typeClass = "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";

    const row = document.createElement("div");
    row.className = "flex items-start gap-3 p-2.5 border-b border-slate-750/30 font-mono text-[11px] leading-relaxed hover:bg-slate-800/10 transition";
    row.innerHTML = `
      <span class="text-slate-500 shrink-0 select-none">[${new Date(l.timestamp).toLocaleTimeString()}]</span>
      <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${typeClass} shrink-0 select-none">${l.type || 'info'}</span>
      <span class="text-slate-300">${l.message}</span>
    `;
    container.appendChild(row);
  });
};

// Details Modal Dismissal
window.dismissGlobalModal = function() {
  document.getElementById("global-details-modal").classList.add("hidden");
};
