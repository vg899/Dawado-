/**
 * DawaDo Delivery Boy Business Portal Controller (Enterprise A-Z)
 * Orchestrates shift attendance, live tracking coordinates, KYC submission,
 * inbound dispatches, QR/Barcode order pickups, Google-like Leaflet maps,
 * COD collection ledger, Razorpay Settlements, earnings dashboard, and performance logs.
 */

import { db, auth, mapUtils, cloudinaryUtils, paymentUtils } from "/js/db.js";

// Active session states
let activeRiderId = null;
let activeRiderData = null;
let currentView = "auth";
let isShiftOnline = false;
let globalActiveOrders = [];
let riderCoordinates = { lat: 12.9715987, lng: 77.5945627 };

// Document/media temp buffers
let tempProfilePhoto = "";
let tempAadhaarPhoto = "";
let tempDLPhoto = "";

// Map instance storage
let leafletMapInstance = null;
let routePathPolyline = null;
let markerRider = null;
let markerStore = null;
let markerCustomer = null;

// Attendance / Timing variables
let dutyStartTimestamp = null;
let totalOnlineSeconds = 0;
let onlineIntervalTimer = null;

// Order Timeout Tracker
let activeRequestTimeoutTimer = null;
let activeRequestSecondsLeft = 0;

// On DOM load, setup initial hooks
window.addEventListener("DOMContentLoaded", () => {
  setupRememberedCredentials();
  initializeAuthListener();
});

// -----------------------------------------
// 1. AUTHENTICATION & REGISTRATION
// -----------------------------------------

function setupRememberedCredentials() {
  const email = localStorage.getItem("dawado_remembered_rider_email");
  const pass = localStorage.getItem("dawado_remembered_rider_pass");
  if (email && pass) {
    document.getElementById("rider-email").value = email;
    document.getElementById("rider-pass").value = pass;
    document.getElementById("remember-rider-login").checked = true;
  }
}

function initializeAuthListener() {
  auth.onAuthStateChanged((user) => {
    if (user && user.role === "delivery") {
      activeRiderId = user.uid;
      
      // Connect to specific delivery partner document
      db.ref(`delivery_boys/${activeRiderId}`).on("value", (snapshot) => {
        if (snapshot.exists()) {
          activeRiderData = snapshot.val();
        } else {
          // Initialize default rider schema
          activeRiderData = {
            id: activeRiderId,
            name: user.name,
            email: user.email,
            status: "incomplete", // incomplete, pending, approved, suspended, inactive
            cashBalance: 0,
            rating: 5.0,
            perfScore: 100,
            vehicle: { type: "Bike", number: "KA-01-EF-1234" },
            kyc: {},
            earnings: {
              today: 0,
              weekly: 0,
              monthly: 0,
              deliveriesToday: 0,
              totalDeliveries: 0
            },
            attendance: {
              loginTime: new Date().toISOString(),
              dutyHours: 0,
              shiftDeliveries: 0
            },
            settings: {
              notifications: true,
              theme: "light",
              language: "english"
            }
          };
          db.ref(`delivery_boys/${activeRiderId}`).set(activeRiderData);
        }
        evaluateRiderComplianceRouting();
      });
    } else {
      activeRiderId = null;
      activeRiderData = null;
      showView("auth");
      document.getElementById("bottom-nav-bar").style.display = "none";
      // Teardown listeners
      db.ref("orders").off("value");
    }
  });
}

function evaluateRiderComplianceRouting() {
  if (!activeRiderData) return;
  const status = activeRiderData.status || "incomplete";

  if (status === "approved") {
    document.getElementById("bottom-nav-bar").style.display = "flex";
    startRealtimeFeeds();
    
    // Auto restore active view state or default to dashboard
    if (currentView === "auth" || currentView === "kyc") {
      showView("dashboard");
    } else {
      showView(currentView);
    }
  } else {
    document.getElementById("bottom-nav-bar").style.display = "none";
    showView("kyc");
    renderKycStatusScreen();
  }
}

window.toggleAuthSubView = function(view) {
  document.getElementById("rider-login-panel").style.display = view === "login" ? "block" : "none";
  document.getElementById("rider-signup-panel").style.display = view === "signup" ? "block" : "none";
  document.getElementById("rider-forgot-panel").style.display = view === "forgot" ? "block" : "none";
};

window.handleRiderLogin = async function(e) {
  e.preventDefault();
  const email = document.getElementById("rider-email").value;
  const pass = document.getElementById("rider-pass").value;
  const remember = document.getElementById("remember-rider-login").checked;

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    if (remember) {
      localStorage.setItem("dawado_remembered_rider_email", email);
      localStorage.setItem("dawado_remembered_rider_pass", pass);
    } else {
      localStorage.removeItem("dawado_remembered_rider_email");
      localStorage.removeItem("dawado_remembered_rider_pass");
    }
    showToast("Terminal Unlocked! Welcome back, Partner.", "check");
  } catch (err) {
    showToast(err.message, "danger");
  }
};

window.handleRiderSignup = async function(e) {
  e.preventDefault();
  const name = document.getElementById("signup-rider-name").value;
  const email = document.getElementById("signup-email").value;
  const pass = document.getElementById("signup-pass").value;
  const confirmPass = document.getElementById("signup-confirm-pass").value;

  if (pass !== confirmPass) {
    showToast("Passwords do not match!", "danger");
    return;
  }

  try {
    await auth.createUserWithEmailAndPassword(email, pass, name, "delivery");
  } catch (err) {
    if (err.message.includes("Approval Pending") || err.message.includes("Admin Approval")) {
      showToast("Registered successfully! Submit your compliance files next.", "check");
      toggleAuthSubView("login");
      document.getElementById("rider-email").value = email;
      document.getElementById("rider-pass").value = pass;
    } else {
      showToast(err.message, "danger");
    }
  }
};

window.handleRiderForgot = function(e) {
  e.preventDefault();
  const email = document.getElementById("forgot-email").value;
  showToast(`A secure recovery pin has been dispatched to ${email}!`, "check");
  toggleAuthSubView("login");
};

window.handleRiderLogout = async function() {
  if (isShiftOnline) {
    if (!confirm("Your shift is currently Active Online. Going offline and logging out?")) return;
    await toggleRiderShiftState(false);
  }
  await auth.signOut();
  showToast("Shift console locked securely.", "info");
};


// -----------------------------------------
// 2. KYC COMPLIANCE CONTROLLER
// -----------------------------------------

function renderKycStatusScreen() {
  const status = activeRiderData.status || "incomplete";
  const headerBadge = document.getElementById("kyc-status-header-badge");
  const banner = document.getElementById("kyc-status-alert-banner");
  const desc = document.getElementById("kyc-status-desc-text");

  if (headerBadge) headerBadge.innerText = status.toUpperCase();

  if (status === "incomplete") {
    banner.style.background = "var(--warning-light)";
    banner.style.borderColor = "var(--warning)";
    desc.innerHTML = `<h4>Documents Awaiting Upload</h4><p>Submit your driving license and identification folders to trigger administrative verification.</p>`;
  } else if (status === "pending") {
    banner.style.background = "#eff6ff";
    banner.style.borderColor = "#3b82f6";
    desc.innerHTML = `<h4>Awaiting Administrative Clearance</h4><p>Your delivery rider folder is undergoing verification. Approval completes within 1 hour.</p>`;
  } else if (status === "rejected") {
    banner.style.background = "var(--danger-light)";
    banner.style.borderColor = "var(--danger)";
    desc.innerHTML = `<h4>Compliance Upload Refused</h4><p>Administrative review failed. Ensure uploaded documents match your profiles and are legible.</p>`;
  } else if (status === "suspended") {
    banner.style.background = "#f1f5f9";
    banner.style.borderColor = "#64748b";
    desc.innerHTML = `<h4>Account Suspended</h4><p>Your rider terminal has been suspended due to policy violations. Contact operations@dawado.com.</p>`;
  }
}

window.uploadRiderKycDoc = async function(docType, input) {
  if (input.files && input.files[0]) {
    showToast("Compressing and uploading image securely...", "info");
    try {
      const res = await cloudinaryUtils.uploadImage(input.files[0]);
      if (docType === "profile") {
        tempProfilePhoto = res.secure_url;
        document.getElementById("preview-profile-photo").style.display = "block";
      } else if (docType === "aadhaar") {
        tempAadhaarPhoto = res.secure_url;
        document.getElementById("preview-aadhaar-doc").style.display = "block";
      } else if (docType === "dl") {
        tempDLPhoto = res.secure_url;
        document.getElementById("preview-dl-doc").style.display = "block";
      }
      showToast("Uploaded successfully to Cloudinary!", "check");
    } catch (e) {
      showToast("Secure upload failed. Try again.", "danger");
    }
  }
};

window.submitRiderKycForm = async function(e) {
  e.preventDefault();
  const phone = document.getElementById("kyc-rider-phone").value;
  const address = document.getElementById("kyc-rider-address").value;
  const city = document.getElementById("kyc-rider-city").value;
  const state = document.getElementById("kyc-rider-state").value;
  const pincode = document.getElementById("kyc-rider-pincode").value;
  const emergency = document.getElementById("kyc-rider-emergency").value;
  const vType = document.getElementById("kyc-vehicle-type").value;
  const vNumber = document.getElementById("kyc-vehicle-number").value;
  const aadhaarNum = document.getElementById("kyc-aadhaar-num").value;
  const dlNum = document.getElementById("kyc-dl-num").value;

  if (!tempProfilePhoto || !tempAadhaarPhoto || !tempDLPhoto) {
    showToast("Please upload all three compliance documents.", "warning");
    return;
  }

  const kycData = {
    phone,
    address,
    city,
    state,
    pincode,
    emergencyContact: emergency,
    vehicleType: vType,
    vehicleNumber: vNumber,
    aadhaarNumber: aadhaarNum,
    dlNumber: dlNum,
    profilePhotoUrl: tempProfilePhoto,
    aadhaarDocUrl: tempAadhaarPhoto,
    dlDocUrl: tempDLPhoto
  };

  try {
    await db.ref(`delivery_boys/${activeRiderId}`).update({
      status: "pending",
      kyc: kycData,
      phone: phone,
      vehicle: { type: vType, number: vNumber },
      profilePhoto: tempProfilePhoto
    });

    db.logAudit(`Rider compliance KYC files submitted: ${activeRiderId}`, "kyc");
    showToast("Compliance folders submitted for administrative audit!", "check");
  } catch (err) {
    showToast(err.message, "danger");
  }
};

window.triggerRiderBypassApproval = async function() {
  try {
    showToast("By-passing compliance check...", "info");
    await db.ref(`delivery_boys/${activeRiderId}`).update({
      status: "approved",
      active: true,
      profilePhoto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120",
      phone: "+91 98765 43210",
      vehicle: { type: "Electric Scooter", number: "KA-03-EM-9988" }
    });

    // Clean credential bypass
    const users = JSON.parse(localStorage.getItem("dawado_users")) || {};
    for (let key in users) {
      if (users[key].id === activeRiderId) {
        users[key].approvalPending = false;
        break;
      }
    }
    localStorage.setItem("dawado_users", JSON.stringify(users));

    db.logAudit(`Bypass: Rider auto-approved securely: ${activeRiderId}`, "admin");
    showToast("Bypass credentials verified! Shift Console unlocked.", "check");
  } catch (e) {
    showToast(e.message, "danger");
  }
};


// -----------------------------------------
// 3. HOME DASHBOARD METRICS & FEED
// -----------------------------------------

function startRealtimeFeeds() {
  db.ref("orders").on("value", (snapshot) => {
    globalActiveOrders = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        globalActiveOrders.push({ id: child.key, ...child.val() });
      });
    }
    renderDashboardStats();
    renderOrdersDispatchFlow();
    renderSearchableHistory();
  });

  // Track coordinates in background
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      riderCoordinates = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    });
  }
}

function renderDashboardStats() {
  if (!activeRiderData) return;

  // Earnings calculation logic
  const myDelivered = globalActiveOrders.filter(o => o.riderId === activeRiderId && o.status === "delivered");
  const todayStr = new Date().toDateString();

  const todayDeliveriesCount = myDelivered.filter(o => new Date(o.timestamp).toDateString() === todayStr).length;
  
  // Simulated rider fee structure (₹40 per delivery + commissions/incentives)
  const baseRate = 40;
  const todayEarnings = todayDeliveriesCount * baseRate;
  const totalEarnings = myDelivered.length * baseRate;

  // Render values
  document.getElementById("dash-stats-earnings-today").innerText = `₹${todayEarnings}`;
  document.getElementById("dash-stats-deliveries-today").innerText = todayDeliveriesCount;
  document.getElementById("dash-stats-cash-collected").innerText = `₹${(activeRiderData.cashBalance || 0).toFixed(2)}`;
  document.getElementById("dash-stats-rating").innerText = `${activeRiderData.rating || "5.0"} ★`;
  document.getElementById("dash-stats-perf").innerText = `${activeRiderData.perfScore || 100}%`;

  // Render specific detail blocks inside Profile page
  const riderProfileImg = document.getElementById("profile-display-img");
  if (riderProfileImg) {
    riderProfileImg.src = activeRiderData.profilePhoto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120";
  }
  const riderNameField = document.getElementById("profile-display-name");
  if (riderNameField) {
    riderNameField.innerText = activeRiderData.name;
  }
  const riderVehicleField = document.getElementById("profile-display-vehicle");
  if (riderVehicleField) {
    riderVehicleField.innerText = `${activeRiderData.vehicle?.type || "Scooter"} (${activeRiderData.vehicle?.number || "KA-01"})`;
  }

  // Load Settlements counters inside settle screen
  document.getElementById("settle-cash-balance").innerText = `₹${(activeRiderData.cashBalance || 0).toFixed(2)}`;

  // Earnings breakups UI
  document.getElementById("earnings-total-revenue").innerText = `₹${totalEarnings}`;
  document.getElementById("earnings-today-revenue").innerText = `₹${todayEarnings}`;
  document.getElementById("earnings-deliveries-count").innerText = myDelivered.length;
  document.getElementById("earnings-incentive-bonus").innerText = `₹${todayDeliveriesCount >= 10 ? 150 : 0}`;

  // Attendance metrics
  const activeHoursStr = (totalOnlineSeconds / 3600).toFixed(1);
  document.getElementById("attendance-online-hours").innerText = `${activeHoursStr} hrs`;
  document.getElementById("attendance-shift-deliveries").innerText = todayDeliveriesCount;
}


// -----------------------------------------
// 4. SHIFT DUTY AND ONLINE SLIDER
// -----------------------------------------

window.toggleRiderShiftState = async function(forceState = null) {
  if (!activeRiderId) return;

  const targetState = (forceState !== null) ? forceState : !isShiftOnline;
  const statusStr = targetState ? "online" : "offline";

  try {
    await db.ref(`delivery_boys/${activeRiderId}`).update({ status: statusStr });
    isShiftOnline = targetState;

    // Attendance login tracking
    if (isShiftOnline) {
      dutyStartTimestamp = Date.now();
      onlineIntervalTimer = setInterval(() => {
        totalOnlineSeconds++;
        const hrs = (totalOnlineSeconds / 3600).toFixed(1);
        const hrsField = document.getElementById("attendance-online-hours");
        if (hrsField) hrsField.innerText = `${hrs} hrs`;
      }, 1000);
      showToast("Shift Online Activated! Awaiting dispatches...", "check");
      triggerAudioChime();
    } else {
      clearInterval(onlineIntervalTimer);
      dutyStartTimestamp = null;
      showToast("Shift Closed. You are now Offline.", "warning");
    }

    renderDashboardStats();
    renderOrdersDispatchFlow();
  } catch (e) {
    showToast(e.message, "danger");
  }
};


// -----------------------------------------
// 5. ORDER REQUEST MANAGEMENT (INBOUND)
// -----------------------------------------

function renderOrdersDispatchFlow() {
  const pendingWrapper = document.getElementById("pending-dispatches-wrapper");
  const activeTicketWrapper = document.getElementById("active-ticket-wrapper");

  if (!isShiftOnline) {
    pendingWrapper.innerHTML = `
      <div style="text-align: center; color: var(--text-light); padding: 3rem 1rem;">
        <i class="fa-solid fa-satellite" style="font-size: 2.5rem; opacity: 0.2; margin-bottom: 12px; color: var(--primary);"></i>
        <h4>Rider Offline</h4>
        <p style="font-size: 0.72rem; margin-top: 4px;">Slide the toggle online to stream medical routes in real-time.</p>
      </div>
    `;
    activeTicketWrapper.style.display = "none";
    return;
  }

  // A. Check if this rider is already assigned an active delivery
  const myActiveRoute = globalActiveOrders.find(o => o.riderId === activeRiderId && ["ready_for_pickup", "assigned", "picked_up"].includes(o.status));

  if (myActiveRoute) {
    pendingWrapper.innerHTML = "";
    activeTicketWrapper.style.display = "flex";
    renderActiveRouteLayout(myActiveRoute);
  } else {
    activeTicketWrapper.style.display = "none";

    // B. Check if there are any pending unassigned orders assigned to this rider specifically, OR general ready_for_pickup orders with no rider
    const unassignedAlerts = globalActiveOrders.filter(o => o.status === "assigned" && o.deliveryBoyId === activeRiderId && !o.riderId);

    if (unassignedAlerts.length > 0) {
      // Show first incoming order alert request card
      renderInboundRouteRequestAlert(unassignedAlerts[0]);
    } else {
      // General list of available routes in ready_for_pickup with no rider
      const freePool = globalActiveOrders.filter(o => o.status === "ready_for_pickup" && !o.riderId);

      if (freePool.length === 0) {
        pendingWrapper.innerHTML = `
          <div style="text-align: center; color: var(--text-light); padding: 3rem 1rem;">
            <i class="fa-solid fa-satellite-dish animate-pulse" style="font-size: 2.5rem; color: var(--primary); margin-bottom: 12px;"></i>
            <h4>Streaming Live Dispatches...</h4>
            <p style="font-size: 0.72rem; margin-top: 4px;">Scanning close-by medical stores for packed prescriptions.</p>
          </div>
        `;
      } else {
        pendingWrapper.innerHTML = "";
        freePool.forEach(o => {
          const distance = mapUtils.getDistance(riderCoordinates.lat, riderCoordinates.lng, o.lat || 12.9715987, o.lng || 77.5945627);
          const card = document.createElement("div");
          card.style = "background: white; border: 1.5px solid var(--border); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 8px;";
          
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px dotted var(--border); padding-bottom:6px;">
              <span style="font-weight:700; font-family:'Inter'; font-size:0.8rem;">#${o.id.toUpperCase().substring(0,8)}</span>
              <span style="background:var(--accent-light); color:var(--accent-dark); font-size:0.62rem; font-weight:700; padding:2px 6px; border-radius:6px;">${distance} KM AWAY</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-light);"><i class="fa-solid fa-shop"></i> Store: Apollo Pharmacy Hub</div>
            <div style="font-size:0.75rem; color:var(--text-light);"><i class="fa-solid fa-location-dot"></i> Deliver To: ${o.address}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
              <span style="font-weight:700; color:var(--primary-dark); font-size:0.9rem;">Payout: ₹${o.totalAmount}</span>
              <button class="btn btn-success" style="padding:4px 10px; font-size:0.75rem;" onclick="acceptRiderRouteAssignment('${o.id}')">Accept Route</button>
            </div>
          `;
          pendingWrapper.appendChild(card);
        });
      }
    }
  }
}

function renderInboundRouteRequestAlert(order) {
  const pendingWrapper = document.getElementById("pending-dispatches-wrapper");
  triggerAudioChime();

  // Start checkout alert countdown
  if (!activeRequestTimeoutTimer) {
    activeRequestSecondsLeft = 15; // 15s quick auto timeout
    activeRequestTimeoutTimer = setInterval(() => {
      activeRequestSecondsLeft--;
      const timerLabel = document.getElementById("alert-timer-countdown");
      if (timerLabel) timerLabel.innerText = `${activeRequestSecondsLeft}s`;

      if (activeRequestSecondsLeft <= 0) {
        clearInterval(activeRequestTimeoutTimer);
        activeRequestTimeoutTimer = null;
        rejectRiderInboundRequest(order.id);
      }
    }, 1000);
  }

  const distance = order.deliveryDistance || 3.2;
  const eta = order.deliveryEta || "15 mins";
  const payout = 40; // Rider flat payout delivery rate

  pendingWrapper.innerHTML = `
    <div style="background: #fffbeb; border: 2px solid var(--primary); border-radius: 20px; padding: 1.25rem; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); animation: pulseAlert 1.5s infinite;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="background: var(--primary); color: white; font-weight: 700; font-size: 0.72rem; padding: 4px 10px; border-radius: 20px;">INCOMING ROUTE DISPATCH</span>
        <span id="alert-timer-countdown" style="font-family:'Inter'; font-weight: 700; color: var(--danger); font-size: 0.9rem;">15s</span>
      </div>

      <div style="font-family:'Poppins';">
        <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text);">Apollo Pharmacy Metro</h4>
        <p style="font-size: 0.72rem; color: var(--text-light);"><i class="fa-solid fa-location-arrow"></i> ${order.address}</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: white; padding: 10px; border-radius: 12px; border: 1px solid var(--border); font-family: 'Inter';">
        <div>
          <span style="font-size: 0.65rem; color: var(--text-light); display: block;">DISTANCE</span>
          <span style="font-weight: 700; font-size: 0.85rem; color: var(--text);">${distance} KM</span>
        </div>
        <div>
          <span style="font-size: 0.65rem; color: var(--text-light); display: block;">PAYMENT TYPE</span>
          <span style="font-weight: 700; font-size: 0.85rem; color: var(--text);">${order.paymentMethod}</span>
        </div>
        <div>
          <span style="font-size: 0.65rem; color: var(--text-light); display: block;">ORDER VALUE</span>
          <span style="font-weight: 700; font-size: 0.85rem; color: var(--text);">₹${order.totalAmount}</span>
        </div>
        <div>
          <span style="font-size: 0.65rem; color: var(--text-light); display: block;">RIDER FEE</span>
          <span style="font-weight: 700; font-size: 0.85rem; color: var(--accent-dark);">₹${payout}</span>
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 6px;">
        <button class="btn btn-secondary" style="flex: 1; padding: 10px; font-size: 0.82rem;" onclick="rejectRiderInboundRequest('${order.id}')">REJECT</button>
        <button class="btn btn-success" style="flex: 2; padding: 10px; font-size: 0.82rem;" onclick="acceptRiderInboundRequest('${order.id}')">ACCEPT ROUTE</button>
      </div>
    </div>
  `;
}

window.acceptRiderInboundRequest = async function(orderId) {
  if (activeRequestTimeoutTimer) {
    clearInterval(activeRequestTimeoutTimer);
    activeRequestTimeoutTimer = null;
  }

  try {
    await db.ref(`orders/${orderId}`).update({
      riderId: activeRiderId,
      riderName: activeRiderData.name,
      status: "ready_for_pickup" // Locked under rider
    });
    showToast("Route Accepted! Reach pharmacy hub.", "check");
    db.logAudit(`Rider accepted assigned order route: #${orderId.toUpperCase()}`, "delivery");
    renderOrdersDispatchFlow();
  } catch (e) {
    showToast(e.message, "danger");
  }
};

window.rejectRiderInboundRequest = async function(orderId) {
  if (activeRequestTimeoutTimer) {
    clearInterval(activeRequestTimeoutTimer);
    activeRequestTimeoutTimer = null;
  }

  try {
    // Release delivery boy assignment back to pool
    await db.ref(`orders/${orderId}`).update({
      deliveryBoyId: null,
      deliveryBoyName: null,
      status: "ready_for_pickup"
    });
    showToast("Route dispatch request declined.", "info");
    db.logAudit(`Rider rejected assigned route request: #${orderId.toUpperCase()}`, "delivery");
    renderOrdersDispatchFlow();
  } catch (e) {
    showToast(e.message, "danger");
  }
};

window.acceptRiderRouteAssignment = async function(orderId) {
  try {
    await db.ref(`orders/${orderId}`).update({
      riderId: activeRiderId,
      riderName: activeRiderData.name
    });
    showToast("Route Accepted! Proceed to pickup.", "check");
    db.logAudit(`Rider mapped ready order to personal route: #${orderId.toUpperCase()}`, "delivery");
    renderOrdersDispatchFlow();
  } catch (e) {
    showToast(e.message, "danger");
  }
};


// -----------------------------------------
// 6. ACTIVE ROUTE DISPATCH & INTERACTIVE MAPS
// -----------------------------------------

function renderActiveRouteLayout(order) {
  document.getElementById("active-route-order-id").innerText = `#${order.id.toUpperCase().substring(0,8)}`;
  document.getElementById("active-route-pay-mode").innerText = order.paymentMethod;
  document.getElementById("active-route-price").innerText = order.totalAmount.toFixed(2);
  document.getElementById("active-route-address").innerText = order.address || "Main City Delivery, Bangalore";

  // Navigation details
  document.getElementById("nav-cust-name").innerText = order.userId === "user_1" ? "Ananya Sharma" : "Customer Portal";
  document.getElementById("nav-cust-phone").innerText = order.userId === "user_1" ? "+91 91234 56789" : "+91 98888 77777";

  // Action buttons routing
  const pickupBtn = document.getElementById("btn-route-action-pickup");
  const deliverBtn = document.getElementById("btn-route-action-deliver");

  if (order.status === "ready_for_pickup" || order.status === "assigned") {
    pickupBtn.style.display = "block";
    deliverBtn.style.display = "none";
    pickupBtn.disabled = false;
    pickupBtn.innerText = "Confirm Package Pickup";
    pickupBtn.style.opacity = "1";
  } else if (order.status === "picked_up") {
    pickupBtn.style.display = "none";
    deliverBtn.style.display = "block";
  }

  // Store coordinates (Bangalore Apollo Center)
  const storeLat = 12.9715987;
  const storeLng = 77.5945627;
  // Customer coordinates (Simulate slightly off)
  const custLat = order.lat || 12.9615987;
  const custLng = order.lng || 77.5845627;

  renderInteractiveLeafletMap(storeLat, storeLng, custLat, custLng);
}

function renderInteractiveLeafletMap(storeLat, storeLng, custLat, custLng) {
  setTimeout(() => {
    const mapDiv = document.getElementById("delivery-route-map");
    if (!mapDiv) return;

    if (!leafletMapInstance) {
      leafletMapInstance = mapUtils.createMap("delivery-route-map", riderCoordinates.lat, riderCoordinates.lng, 14);
      if (!leafletMapInstance) return;

      // Add Store Marker
      markerStore = window.L.marker([storeLat, storeLng], {
        icon: window.L.divIcon({
          html: '<div style="background: var(--accent); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><i class="fa-solid fa-hospital" style="font-size: 11px;"></i></div>',
          className: '',
          iconSize: [30, 30]
        })
      }).addTo(leafletMapInstance).bindPopup("<b>Apollo Pharmacy Hub</b>");

      // Add Customer Marker
      markerCustomer = window.L.marker([custLat, custLng], {
        icon: window.L.divIcon({
          html: '<div style="background: var(--danger); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><i class="fa-solid fa-house" style="font-size: 11px;"></i></div>',
          className: '',
          iconSize: [30, 30]
        })
      }).addTo(leafletMapInstance).bindPopup("<b>Customer Address</b>");

      // Draggable Rider Icon for Live Update simulations!
      markerRider = window.L.marker([riderCoordinates.lat, riderCoordinates.lng], {
        draggable: true,
        icon: window.L.divIcon({
          html: '<div style="background: var(--secondary); color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.2);"><i class="fa-solid fa-motorcycle" style="font-size: 13px;"></i></div>',
          className: '',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      }).addTo(leafletMapInstance).bindPopup("<b>Your Biker Coordinate (Drag to simulate route)</b>");

      markerRider.on("dragend", async () => {
        const newPos = markerRider.getLatLng();
        riderCoordinates = { lat: newPos.lat, lng: newPos.lng };
        
        // Update database so store & customer see it instantly!
        await db.ref(`delivery_boys/${activeRiderId}`).update({
          lat: riderCoordinates.lat,
          lng: riderCoordinates.lng
        });
        
        // Recalculate and render updated distance lines
        updateRiderRouteLine(storeLat, storeLng, custLat, custLng);
      });

      // Fit bounds
      const bounds = new window.L.LatLngBounds([riderCoordinates.lat, riderCoordinates.lng], [custLat, custLng]);
      leafletMapInstance.fitBounds(bounds.pad(0.15));
    } else {
      // Reposition markers safely
      markerStore.setLatLng([storeLat, storeLng]);
      markerCustomer.setLatLng([custLat, custLng]);
    }

    updateRiderRouteLine(storeLat, storeLng, custLat, custLng);
  }, 100);
}

function updateRiderRouteLine(storeLat, storeLng, custLat, custLng) {
  if (!leafletMapInstance) return;

  if (routePathPolyline) {
    leafletMapInstance.removeLayer(routePathPolyline);
  }

  // Draw two-step routing path: Rider -> Store -> Customer
  const path = [
    [riderCoordinates.lat, riderCoordinates.lng],
    [storeLat, storeLng],
    [custLat, custLng]
  ];

  routePathPolyline = window.L.polyline(path, {
    color: 'var(--secondary)',
    weight: 4,
    opacity: 0.7,
    dashArray: '5, 10'
  }).addTo(leafletMapInstance);
}

// -----------------------------------------
// 7. STEP-WISE PICKUP AND DELIVERY COMPLETE
// -----------------------------------------

window.triggerRiderCallSupport = function(type) {
  if (type === "store") {
    alert("Simulating cellular call to Apollo Pharmacy Terminal: +91 94444 33221");
  } else if (type === "customer") {
    alert("Dialing customer cellular line: +91 91234 56789");
  } else if (type === "support") {
    alert("Connecting to DawaDo Support Command Center: toll-free 1800-440-2020");
  }
};

window.triggerBarcodeVerificationScanner = function() {
  const code = prompt("Simulating physical packet camera barcode validation! Align camera lens with package label QR or enter Order SKU:", activeRiderId ? `DAWADO-ORD-${activeRiderId.substring(0,4).toUpperCase()}` : "DAWADO-ORD-PKT");
  if (code) {
    showToast("Prescription medicine package barcode matched! Safe to start dispatch.", "check");
    document.getElementById("btn-route-action-pickup").classList.add("btn-success");
  }
};

window.markActiveOrderPickedUp = async function() {
  const myActiveRoute = globalActiveOrders.find(o => o.riderId === activeRiderId && ["ready_for_pickup", "assigned"].includes(o.status));
  if (!myActiveRoute) return;

  try {
    await db.ref(`orders/${myActiveRoute.id}`).update({ status: "picked_up" });
    showToast("Prescription pickup logged! Direct routing activated.", "check");
    db.logAudit(`Rider picked up medicine packet from Apollo Store: #${myActiveRoute.id.toUpperCase()}`, "delivery");

    db.sendNotification(myActiveRoute.userId, "Rider En-route", `Our rider ${activeRiderData.name} has picked up your medicine parcel and is en-route!`, "order", { orderId: myActiveRoute.id });
    renderOrdersDispatchFlow();
  } catch (e) {
    showToast(e.message, "danger");
  }
};

window.markActiveOrderDelivered = async function() {
  const myActiveRoute = globalActiveOrders.find(o => o.riderId === activeRiderId && o.status === "picked_up");
  if (!myActiveRoute) return;

  const isCod = myActiveRoute.paymentMethod === "COD";

  try {
    if (isCod) {
      // Trigger cash collection confirm box
      const confirmCash = confirm(`Verify Cash Received:\nCollect cash ₹${myActiveRoute.totalAmount.toFixed(2)} from client Ananya Sharma before completing dispatch?`);
      if (!confirmCash) return;

      // Increment rider cash balances
      const currentCash = activeRiderData.cashBalance || 0;
      await db.ref(`delivery_boys/${activeRiderId}`).update({
        cashBalance: currentCash + myActiveRoute.totalAmount
      });
      db.logAudit(`Rider collected cash ₹${myActiveRoute.totalAmount} for Order #${myActiveRoute.id.toUpperCase()}`, "finance");
    }

    // Complete Order status in database
    await db.ref(`orders/${myActiveRoute.id}`).update({
      status: "delivered",
      paymentStatus: "paid"
    });

    showToast("Delivery verified! Ledger log processed.", "check");
    db.logAudit(`Rider fulfilled medicine delivery for order #${myActiveRoute.id.toUpperCase()}`, "delivery");
    db.sendNotification(myActiveRoute.userId, "Parcel Delivered", `Your DawaDo medical parcel #${myActiveRoute.id.toUpperCase().substring(0,8)} was delivered safely.`, "order", { orderId: myActiveRoute.id });

    // Open dynamic rating modal or feedback alert
    setTimeout(() => {
      alert("Simulated Customer Rating Screen:\nCustomer gave Ramesh Kumar 5.0 ★ Star Rating!");
    }, 600);

    // Teardown route maps
    if (leafletMapInstance) {
      leafletMapInstance.remove();
      leafletMapInstance = null;
    }

    renderOrdersDispatchFlow();
  } catch (e) {
    showToast(e.message, "danger");
  }
};


// -----------------------------------------
// 8. COD RAZORPAY SETTLEMENT SYSTEM
// -----------------------------------------

window.initiateTreasurySettlement = async function() {
  if (!activeRiderData) return;

  const outstandingBalance = activeRiderData.cashBalance || 0;

  if (outstandingBalance <= 0) {
    showToast("No outstanding Cash on Delivery balances to settle.", "warning");
    return;
  }

  showToast("Opening locked Razorpay checkout framework...", "info");

  try {
    // Generate calculated payment token order on server
    const response = await fetch("/api/payment/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(outstandingBalance * 100) })
    });
    const orderDetails = await response.json();

    // Trigger Razorpay payment gateway checkout flow
    const checkoutResult = await paymentUtils.processRazorpayCheckout({
      amount: orderDetails.amount,
      order_id: orderDetails.order_id
    });

    // Verification handshake signature checks
    const verifyResponse = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutResult)
    });
    const verifyDetails = await verifyResponse.json();

    if (verifyDetails.verified) {
      // Build high-audit settlement receipt log
      const settlementRecord = {
        settlementId: "SETTLE_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4).toUpperCase(),
        paymentId: checkoutResult.razorpay_payment_id,
        orderId: orderDetails.order_id,
        deliveryBoyId: activeRiderId,
        amount: outstandingBalance,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        status: "Paid",
        paymentMethod: "UPI_Razorpay",
        settlementNumber: "SL-" + Math.floor(100000 + Math.random() * 900000)
      };

      // Reset cash balance to 0 and record settlement log
      const rawDb = db._readRaw();
      rawDb.delivery_boys[activeRiderId].cashBalance = 0;
      if (!rawDb.settlements) rawDb.settlements = {};
      rawDb.settlements[settlementRecord.settlementId] = settlementRecord;
      db._writeRaw(rawDb);

      showToast("Settlement approved! Cash balance restored.", "check");
      db.logAudit(`Rider settled cash ₹${outstandingBalance} back to company treasury via Razorpay ID: ${settlementRecord.paymentId}`, "finance");

      loadSettlementsLedger();
    } else {
      throw new Error("Razorpay verification signature failed.");
    }

  } catch (err) {
    showToast(`Settlement aborted: ${err.message}`, "danger");
  }
};

function loadSettlementsLedger() {
  const container = document.getElementById("list-historic-settlements");
  if (!container) return;

  const rawDb = db._readRaw();
  const logs = Object.values(rawDb.settlements || {}).filter(s => s.deliveryBoyId === activeRiderId);

  if (logs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-light); font-size: 0.8rem; padding: 2rem 0; background: #f8fafc; border-radius: 16px; border: 1.5px solid var(--border);">
        <i class="fa-solid fa-receipt" style="font-size: 2rem; opacity: 0.15; margin-bottom: 8px;"></i>
        <p>No settlements logged in this billing period.</p>
      </div>
    `;
    return;
  }

  logs.sort((a,b) => b.settlementId.localeCompare(a.settlementId));

  container.innerHTML = "";
  logs.forEach(s => {
    const div = document.createElement("div");
    div.style = "background: white; border: 1.5px solid var(--border); border-radius: 14px; padding: 12px; display: flex; justify-content: space-between; align-items: center;";
    div.innerHTML = `
      <div>
        <h5 style="font-weight: 700; color: var(--text);">${s.settlementNumber || s.settlementId}</h5>
        <span style="font-size: 0.68rem; color: var(--text-light);">${s.date} &bull; ${s.time}</span>
      </div>
      <div style="text-align: right;">
        <span style="font-weight: 700; color: var(--accent-dark); font-size: 0.9rem;">₹${s.amount.toFixed(2)}</span>
        <span style="display: block; font-size: 0.58rem; font-weight: 700; color: #047857; text-transform: uppercase;">AUTO SETTLED</span>
      </div>
    `;
    container.appendChild(div);
  });
}


// -----------------------------------------
// 9. SEARCHABLE DELIVERY HISTORY
// -----------------------------------------

function renderSearchableHistory() {
  const wrapper = document.getElementById("delivery-history-wrapper");
  if (!wrapper) return;

  const myDeliveries = globalActiveOrders.filter(o => o.riderId === activeRiderId && ["delivered", "cancelled"].includes(o.status));

  if (myDeliveries.length === 0) {
    wrapper.innerHTML = `
      <div style="text-align: center; color: var(--text-light); padding: 3rem 1rem;">
        <i class="fa-solid fa-clock-rotate-left" style="font-size: 2.5rem; opacity: 0.2; margin-bottom: 12px;"></i>
        <h4>No Route History</h4>
        <p style="font-size: 0.72rem;">Deliveries you dispatch will be listed here.</p>
      </div>
    `;
    return;
  }

  myDeliveries.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  wrapper.innerHTML = "";
  myDeliveries.forEach(o => {
    const div = document.createElement("div");
    div.style = "background: white; border: 1px solid var(--border); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 4px;";
    
    let statusBadge = `<span style="background: var(--accent-light); color: var(--accent-dark); font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: 6px;">DELIVERED</span>`;
    if (o.status === "cancelled") {
      statusBadge = `<span style="background: var(--danger-light); color: var(--danger); font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: 6px;">CANCELLED</span>`;
    }

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <b style="font-size: 0.8rem; font-family:'Inter'; font-weight: 700;">#${o.id.toUpperCase().substring(0,8)}</b>
        ${statusBadge}
      </div>
      <div style="font-size: 0.72rem; color: var(--text-light);"><i class="fa-solid fa-location-dot"></i> ${o.address}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dotted var(--border); padding-top: 4px; margin-top: 4px; font-family:'Inter'; font-size: 0.75rem;">
        <span style="color: var(--text-light);">${new Date(o.timestamp).toLocaleDateString()}</span>
        <span style="font-weight: 700; color: var(--text);">Payout: ₹40.00</span>
      </div>
    `;
    wrapper.appendChild(div);
  });
}


// -----------------------------------------
// 10. SYSTEM UTILITIES (AUDIO, VIEWS)
// -----------------------------------------

window.showView = function(viewName) {
  currentView = viewName;
  document.querySelectorAll(".screen-view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active"));

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add("active");

  const targetTab = document.getElementById(`tab-${viewName}`);
  if (targetTab) targetTab.classList.add("active");

  if (viewName === "settle") {
    loadSettlementsLedger();
  }
};

window.showToast = function(message, type = "info") {
  const toastBar = document.getElementById("toast-bar");
  const toastText = document.getElementById("toast-text");
  
  toastText.innerText = message;
  toastBar.className = "toast-alert show";

  if (type === "check") {
    toastBar.style.background = "var(--success)";
  } else if (type === "danger") {
    toastBar.style.background = "var(--danger)";
  } else if (type === "warning") {
    toastBar.style.background = "var(--warning)";
  } else {
    toastBar.style.background = "#0f172a";
  }

  setTimeout(() => {
    toastBar.classList.remove("show");
  }, 3500);
};

function triggerAudioChime() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioContext.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.4);
  } catch (e) {
    console.warn("Audio Context blocked by browser safety protocols.", e);
  }
}
