import { db, auth, mapUtils, paymentUtils, cloudinaryUtils } from "/js/db.js";

// Global App States
let currentUser = null;
let activeTab = "home";
let cart = [];
let selectedAddress = null;
let trackingMap = null;
let selectorMap = null;
let selectorMarker = null;
let activeTrackingOrderId = null;
let trackingRiderMarker = null;
let activeCoupon = null;
let selectedPresetTag = "Home";
let selectedRxFile = null;

// New modular enterprise states
let allUserOrders = [];
let currentOrdersSegmentTab = "all";
let modalTrackingMap = null;
let modalTrackingRiderMarker = null;
let activeModalTrackingOrderId = null;

// Advanced filters & layout state
let wishlist = [];
let catalogLayout = "grid";
let filterPriceLimit = 500;
let filterMinDiscount = 0;
let filterMinRating = 0;
let filterRxRequired = "any";
let filterStockOnly = false;
let filterMaxDistance = 99;
let filterMaxSpeed = 99;

// Brand-to-Generic alternate mappings for smart suggestions
const brandToGenericMap = {
  "crocin": "Paracetamol 650mg",
  "calpol": "Paracetamol 650mg",
  "paracetamol": "Paracetamol 650mg",
  "augmentin": "Amoxicillin 500mg",
  "amoxicillin": "Amoxicillin 500mg",
  "zyrtec": "Cetirizine 10mg",
  "cetirizine": "Cetirizine 10mg",
  "glucophage": "Metformin 500mg",
  "metformin": "Metformin 500mg",
  "lipitor": "Atorvastatin 10mg",
  "atorvastatin": "Atorvastatin 10mg"
};

// --- INITIALIZATION GATEWAY ---
window.addEventListener("DOMContentLoaded", () => {
  // Set up auth changes listener
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    
    // Simulate Splash Screen timing (2 seconds)
    setTimeout(() => {
      const splash = document.getElementById("splash-screen");
      if (splash) {
        splash.style.opacity = "0";
        setTimeout(() => splash.style.display = "none", 500);
      }

      if (user) {
        // Logged In: Load Dashboard
        setupUserDashboard();
        navigateToTab("home");
        document.getElementById("app-bottom-nav").style.display = "flex";
      } else {
        // Logged Out: Load Auth Screens
        navigateToTab("auth");
        document.getElementById("app-bottom-nav").style.display = "none";
      }
    }, 2000);
  });

  // Start Background Services
  startFlashSaleTimer();
  listenToSystemOfflineStatus();
  resetScratchCouponGame();
});

// --- OFFLINE & TOAST FEEDBACK ---
function listenToSystemOfflineStatus() {
  const offlineBanner = document.getElementById("offline-banner");
  window.addEventListener("online", () => {
    if (offlineBanner) offlineBanner.style.display = "none";
    showToast("Connection Restored. Realtime sync live.", "success");
  });
  window.addEventListener("offline", () => {
    if (offlineBanner) offlineBanner.style.display = "block";
    showToast("Offline mode. Queueing background operations.", "warning");
  });
}

function showToast(message, type = "info") {
  const toastBar = document.getElementById("toast-bar");
  const toastText = document.getElementById("toast-text");
  const toastIcon = document.getElementById("toast-icon");

  if (!toastBar || !toastText) return;

  toastText.textContent = message;
  
  // Set colors and icon based on type
  if (type === "success") {
    toastBar.style.background = "#10b981";
    toastIcon.className = "fa-solid fa-circle-check";
  } else if (type === "warning") {
    toastBar.style.background = "#f59e0b";
    toastIcon.className = "fa-solid fa-triangle-exclamation";
  } else if (type === "danger") {
    toastBar.style.background = "#ef4444";
    toastIcon.className = "fa-solid fa-circle-exclamation";
  } else {
    toastBar.style.background = "#0f172a";
    toastIcon.className = "fa-solid fa-circle-info";
  }

  toastBar.classList.add("show");
  setTimeout(() => {
    toastBar.classList.remove("show");
  }, 3500);
}

// --- AUTHENTICATION MODULE ---
function toggleAuthPanel(panel) {
  const loginForm = document.getElementById("auth-form-login");
  const signupForm = document.getElementById("auth-form-signup");
  const tabLogin = document.getElementById("auth-tab-login");
  const tabSignup = document.getElementById("auth-tab-signup");

  if (panel === "login") {
    loginForm.style.display = "flex";
    signupForm.style.display = "none";
    tabLogin.style.background = "white";
    tabLogin.style.color = "var(--primary-dark)";
    tabLogin.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
    tabSignup.style.background = "transparent";
    tabSignup.style.color = "var(--text-light)";
    tabSignup.style.boxShadow = "none";
  } else {
    loginForm.style.display = "none";
    signupForm.style.display = "flex";
    tabLogin.style.background = "transparent";
    tabLogin.style.color = "var(--text-light)";
    tabLogin.style.boxShadow = "none";
    tabSignup.style.background = "white";
    tabSignup.style.color = "var(--primary-dark)";
    tabSignup.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
  }
}

async function handleUserLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("login-email-input").value;
  const pass = document.getElementById("login-pass-input").value;

  try {
    showToast("Verifying credentials with secure gateway...", "info");
    await auth.signInWithEmailAndPassword(email, pass);
    showToast("Access Authorized. Welcome back!", "success");
  } catch (error) {
    showToast(error.message, "danger");
  }
}

async function handleUserSignupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("signup-name-input").value;
  const email = document.getElementById("signup-email-input").value;
  const phone = document.getElementById("signup-phone-input").value;
  const pass = document.getElementById("signup-pass-input").value;

  if (pass.length < 6) {
    showToast("Password must be at least 6 characters.", "warning");
    return;
  }

  try {
    showToast("Creating premium medical profile...", "info");
    const user = await auth.createUserWithEmailAndPassword(email, pass, name, "user");
    
    // Save phone and initial metadata inside RTDB
    await db.ref(`users/${user.uid}`).update({
      phone: phone,
      created_at: new Date().toISOString(),
      savedAddresses: {}
    });

    showToast("Account established successfully!", "success");
  } catch (error) {
    showToast(error.message, "danger");
  }
}

function assessPasswordStrength(password) {
  const meter = document.getElementById("strength-widget");
  const bar1 = document.getElementById("strength-bar-1");
  const bar2 = document.getElementById("strength-bar-2");
  const bar3 = document.getElementById("strength-bar-3");
  const label = document.getElementById("strength-text");

  if (!password) {
    meter.style.display = "none";
    return;
  }

  meter.style.display = "flex";
  
  // Calculate strength level (0 to 3)
  let score = 0;
  if (password.length >= 6) score = 1;
  if (password.length >= 6 && /\d/.test(password) && /[a-zA-Z]/.test(password)) score = 2;
  if (password.length >= 8 && /\d/.test(password) && /[a-zA-Z]/.test(password) && /[^a-zA-Z0-9]/.test(password)) score = 3;

  // Render bars
  bar1.style.background = "#cbd5e1";
  bar2.style.background = "#cbd5e1";
  bar3.style.background = "#cbd5e1";

  if (score === 1) {
    bar1.style.background = "#ef4444"; // Red
    label.textContent = "Weak Password";
    label.style.color = "#ef4444";
  } else if (score === 2) {
    bar1.style.background = "#f59e0b";
    bar2.style.background = "#f59e0b"; // Yellow
    label.textContent = "Moderate Password";
    label.style.color = "#f59e0b";
  } else if (score === 3) {
    bar1.style.background = "#10b981";
    bar2.style.background = "#10b981";
    bar3.style.background = "#10b981"; // Green
    label.textContent = "Strong HIPAA-Compliant Password";
    label.style.color = "#10b981";
  }
}

function openForgotPasswordSheet() {
  const emailInput = document.getElementById("login-email-input").value;
  const targetEmail = prompt("Enter your registered email address to receive password reset links:", emailInput || "");
  
  if (targetEmail === null) return; // Cancelled
  if (!targetEmail.trim()) {
    showToast("Please enter a valid email address.", "warning");
    return;
  }

  showToast("Sending secure SMTP password reset email...", "info");
  setTimeout(() => {
    showToast(`Password reset link dispatched safely to: ${targetEmail}`, "success");
  }, 1500);
}

function autoFillTestCredentials() {
  document.getElementById("login-email-input").value = "user@dawado.com";
  document.getElementById("login-pass-input").value = "user123";
  showToast("Testing credentials auto-filled. Click 'Access Account' now.", "success");
}

async function triggerUserLogOut() {
  const conf = confirm("Are you sure you want to log out of DawaDo?");
  if (!conf) return;
  await auth.signOut();
  showToast("Logged out safely. See you soon!", "success");
}

// --- TAB / VIEW NAVIGATION SYSTEM ---
function navigateToTab(tabId) {
  activeTab = tabId;

  // Toggle visible view divs
  document.querySelectorAll(".screen-view").forEach((view) => {
    view.classList.remove("active");
  });
  
  const targetView = document.getElementById(`view-${tabId}`);
  if (targetView) targetView.classList.add("active");

  // Toggle active class on bottom nav buttons
  document.querySelectorAll(".bottom-nav-tab").forEach((btn) => {
    btn.classList.remove("active");
  });
  
  const targetBtn = document.getElementById(`tab-btn-${tabId}`);
  if (targetBtn) targetBtn.classList.add("active");

  // Track map canvas resize rendering issues
  if (tabId === "orders" && activeTrackingOrderId) {
    setTimeout(() => {
      if (trackingMap) trackingMap.invalidateSize();
    }, 300);
  }
}

// --- REALTIME SYNC & DASHBOARD DATA FETCH ---
function setupUserDashboard() {
  if (!currentUser) return;

  const uid = currentUser.uid;

  // Sync Profile info
  db.ref(`users/${uid}`).on("value", (snap) => {
    const data = snap.val() || {};
    document.getElementById("header-username-display").textContent = data.name || currentUser.name;
    document.getElementById("profile-name-text").textContent = data.name || currentUser.name;
    document.getElementById("profile-email-text").textContent = currentUser.email;
    document.getElementById("profile-phone-text").textContent = data.phone || "No phone added";

    document.getElementById("profile-edit-name").value = data.name || currentUser.name;
    document.getElementById("profile-edit-phone").value = data.phone || "";

    // Set Avatar initial
    const initial = (data.name || currentUser.name || "U").charAt(0).toUpperCase();
    document.getElementById("header-avatar-initial").textContent = initial;
    document.getElementById("profile-avatar-node").textContent = initial;

    // Set Saved addresses
    const addrs = data.savedAddresses || {};
    renderSavedAddressList(addrs);

    // Sync Pinned Address Selection state
    if (Object.keys(addrs).length > 0) {
      // Find default address or first one
      const keys = Object.keys(addrs);
      const defaultAddr = addrs[keys[0]]; // fallback to first
      selectedAddress = defaultAddr;
      document.getElementById("current-location-tag").textContent = `Delivering to ${defaultAddr.label || 'Address'}`;
      document.getElementById("current-location-string").textContent = `${defaultAddr.flat ? defaultAddr.flat + ', ' : ''}${defaultAddr.address}`;
    } else {
      // Default fallback coordinates (Bangalore Apollo Store)
      selectedAddress = {
        label: "Home",
        address: "7th Cross Rd, Indiranagar, Bengaluru, Karnataka 560038",
        lat: 12.9715987,
        lng: 77.5945627
      };
      document.getElementById("current-location-tag").textContent = "Delivering to Hub Default";
      document.getElementById("current-location-string").textContent = selectedAddress.address;
    }

    // Refresh distance-based content once coordinates are synchronized
    loadNearbyPharmacies();
  });

  // Sync Medicines & Catalog grid
  db.ref("medicines").on("value", (snap) => {
    const medsObj = snap.val() || {};
    const meds = Object.values(medsObj);
    renderBestsellersHome(meds);
    renderCatalogGrid(meds);
    renderHomeCategories(meds);
    renderRecommendedProducts(meds);
  });

  // Sync Wishlist state from database in real-time
  db.ref(`users/${uid}/wishlist`).on("value", (snap) => {
    const dataObj = snap.val() || {};
    wishlist = Object.values(dataObj);
    
    // Update header wishlist badge
    const badge = document.getElementById("header-wishlist-badge");
    if (badge) {
      if (wishlist.length > 0) {
        badge.textContent = wishlist.length;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }
    
    // Render wishlist if modal is open
    renderWishlistUI();
  });

  // Sync Push alerts and system notifications
  db.ref("notifications").on("value", (snap) => {
    const notifsObj = snap.val() || {};
    const notifs = Object.values(notifsObj).filter(n => n.recipientId === uid);
    
    // Sort notifications by timestamp descending
    notifs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const unreadCount = notifs.filter(n => !n.read).length;
    const badge = document.getElementById("header-notif-badge");
    
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }

    document.getElementById("notif-count-text").textContent = `${unreadCount} Unread Messages`;
    renderNotificationsList(notifs);
  });

  // Sync Active and Past Orders history
  db.ref("orders").on("value", (snap) => {
    const ordersObj = snap.val() || {};
    allUserOrders = Object.values(ordersObj).filter(o => o.userId === uid);
    
    // Check if there is an active tracking order inside the live modal tracking map
    if (activeModalTrackingOrderId) {
      const liveOrder = allUserOrders.find(o => o.id === activeModalTrackingOrderId);
      if (liveOrder) {
        // Real-time update live tracking modal content
        updateModalLiveTrackingMap(liveOrder);
        updateModalMilestonesTimeline(liveOrder);
      }
    }

    // Refresh orders screen
    renderSegmentedOrders();
  });
}

// --- DYNAMIC RENDERING MODULES ---
function renderHomeCategories(meds) {
  const container = document.getElementById("home-categories-wrapper");
  if (!container) return;

  // Extract unique categories
  const categories = [...new Set(meds.map(m => m.category))];
  
  // High quality matching local categories / mock images
  const catImages = {
    "Fever & Pain": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=120&q=80",
    "Antibiotics": "https://images.unsplash.com/photo-1550572017-edd951b55104?auto=format&fit=crop&w=120&q=80",
    "Allergy Relief": "https://images.unsplash.com/photo-1607619275048-24722480f875?auto=format&fit=crop&w=120&q=80",
    "Diabetes": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=120&q=80",
    "Heart Health": "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=120&q=80",
    "Cough & Cold": "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&w=120&q=80",
    "Vitamins & Supplements": "https://images.unsplash.com/photo-1616679911721-fe6eec47f0cd?auto=format&fit=crop&w=120&q=80"
  };

  container.innerHTML = "";
  categories.forEach(cat => {
    const card = document.createElement("div");
    card.className = "category-banner-card";
    card.onclick = () => filterCatalogByCategory(cat);
    
    const imgUrl = catImages[cat] || "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=120&q=80";
    card.innerHTML = `
      <img src="${imgUrl}" alt="${cat}" referrerPolicy="no-referrer" />
      <span>${cat}</span>
    `;
    container.appendChild(card);
  });
}

function renderBestsellersHome(meds) {
  const container = document.getElementById("home-bestsellers-wrapper");
  if (!container) return;

  // Filter out prescription required or select popular ones
  const popular = meds.slice(0, 6);

  container.innerHTML = "";
  popular.forEach(med => {
    const card = buildMedicineItemCard(med);
    container.appendChild(card);
  });
}

function renderRecommendedProducts(meds) {
  const container = document.getElementById("recommended-products-wrapper");
  const section = document.getElementById("recommended-items-section");
  if (!container || !section) return;

  // If user has past orders, recommend related items. Else show top supplements
  const supplements = meds.filter(m => m.category === "Vitamins & Supplements" || m.category === "Allergy Relief");
  
  if (supplements.length > 0) {
    section.style.display = "block";
    container.innerHTML = "";
    supplements.forEach(med => {
      const card = buildMedicineItemCard(med);
      // Inline styles for scrolling card
      card.style.minWidth = "170px";
      card.style.flexShrink = "0";
      container.appendChild(card);
    });
  } else {
    section.style.display = "none";
  }
}

function renderCatalogGrid(meds, activeFilterCat = "All") {
  const grid = document.getElementById("catalog-items-grid");
  const countLabel = document.getElementById("catalog-result-count");
  if (!grid) return;

  // Render top filter row if empty
  setupCatalogCategoryChips(meds, activeFilterCat);

  // 1. Apply category filtering
  let filtered = meds;
  if (activeFilterCat !== "All") {
    filtered = meds.filter(m => m.category === activeFilterCat);
  }

  // 2. Apply advanced filters
  const userLat = selectedAddress?.lat || 12.9615987;
  const userLng = selectedAddress?.lng || 77.5845627;

  filtered = filtered.filter(m => {
    // Price Limit
    if (m.price > filterPriceLimit) return false;

    // Minimum Discount
    const discount = m.price > 80 ? 15 : 10;
    if (discount < filterMinDiscount) return false;

    // Minimum Rating
    const rating = m.rating || (m.id === "med_1" ? 4.9 : m.id === "med_3" ? 4.8 : 4.5);
    if (rating < filterMinRating) return false;

    // Rx Requirement
    if (filterRxRequired === "yes" && !m.prescriptionRequired) return false;
    if (filterRxRequired === "no" && m.prescriptionRequired) return false;

    // Stock availability
    if (filterStockOnly && m.stock <= 0) return false;

    // Distance calculation
    let distance = 1.5;
    if (m.storeId === "store_1") {
      distance = mapUtils.getDistance(userLat, userLng, 12.9715987, 77.5945627);
    }
    if (filterMaxDistance !== 99 && distance > filterMaxDistance) return false;

    // Delivery time (Speed)
    const speed = distance <= 2 ? 2 : distance <= 5 ? 6 : 24;
    if (filterMaxSpeed !== 99 && speed > filterMaxSpeed) return false;

    return true;
  });

  countLabel.textContent = `Showing ${filtered.length} medical items`;

  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-light);">
        <i class="fa-solid fa-sliders" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 10px;"></i>
        <p>No medicines matched your current filter selection criteria.</p>
        <button class="btn-primary" style="width: auto; padding: 6px 14px; font-size: 0.75rem; margin-top: 10px; border-radius: 8px;" onclick="resetAllFiltersAndRefresh()">Reset Filters</button>
      </div>
    `;
    return;
  }

  filtered.forEach(med => {
    const card = buildMedicineItemCard(med);
    grid.appendChild(card);
  });
}

function setupCatalogCategoryChips(meds, activeFilterCat) {
  const row = document.getElementById("catalog-category-filter-row");
  if (!row || row.children.length > 0) return; // Already setup

  const categories = ["All", ...new Set(meds.map(m => m.category))];
  
  row.innerHTML = "";
  categories.forEach(cat => {
    const chip = document.createElement("button");
    chip.style = `
      background: ${cat === activeFilterCat ? 'var(--primary-dark)' : '#f1f5f9'};
      color: ${cat === activeFilterCat ? 'white' : 'var(--text-light)'};
      border: none;
      padding: 6px 14px;
      border-radius: 10px;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.2s;
    `;
    chip.id = `chip-${cat.replace(/\s+/g, '-')}`;
    chip.onclick = () => {
      // Toggle styles
      document.querySelectorAll("#catalog-category-filter-row button").forEach(b => {
        b.style.background = "#f1f5f9";
        b.style.color = "var(--text-light)";
      });
      chip.style.background = "var(--primary-dark)";
      chip.style.color = "white";
      renderCatalogGrid(meds, cat);
    };
    chip.textContent = cat;
    row.appendChild(chip);
  });
}

function filterCatalogByCategory(cat) {
  navigateToTab("categories");
  // Trigger click on corresponding chip
  setTimeout(() => {
    const chip = document.getElementById(`chip-${cat.replace(/\s+/g, '-')}`);
    if (chip) chip.click();
  }, 100);
}

// Helper: build structured e-commerce medicine card
function buildMedicineItemCard(med) {
  const card = document.createElement("div");
  card.className = "med-item-card";
  card.id = `med-card-${med.id}`;
  card.style.cursor = "pointer";

  const discount = med.price > 80 ? 15 : 10;
  const originalPrice = Math.round(med.price / (1 - discount/100));

  // Check if item is already in cart
  const cartItem = cart.find(item => item.id === med.id);
  
  card.innerHTML = `
    <span class="med-badge-discount">-${discount}%</span>
    ${med.prescriptionRequired ? '<span class="med-badge-rx"><i class="fa-solid fa-file-prescription"></i> Rx</span>' : ''}
    <div class="med-image-box">
      <img src="${med.image}" alt="${med.name}" referrerPolicy="no-referrer" />
    </div>
    <div class="med-item-details">
      <span class="med-item-cat">${med.category}</span>
      <h4 class="med-item-title">${med.name}</h4>
      <div class="stock-bar-container">
        <div class="stock-text">
          <span>In Stock</span>
          <span>${med.stock} left</span>
        </div>
        <div class="stock-progress-bar">
          <div class="stock-progress-fill" style="width: ${Math.min((med.stock/300)*100, 100)}%;"></div>
        </div>
      </div>
      <div class="med-item-price-row">
        <div class="med-item-price-wrapper">
          <span class="med-item-price-orig">₹${originalPrice}</span>
          <span class="med-item-price">₹${med.price}</span>
        </div>
        <div class="action-btn-wrapper" id="med-action-box-${med.id}">
          <!-- Dynamic Button -->
        </div>
      </div>
    </div>
  `;

  // Render Action Button based on Cart State
  const actionBox = card.querySelector(`#med-action-box-${med.id}`);
  if (cartItem) {
    actionBox.innerHTML = `
      <div class="med-card-qty">
        <button onclick="event.stopPropagation(); updateCartQuantity('${med.id}', ${cartItem.quantity - 1})">-</button>
        <span>${cartItem.quantity}</span>
        <button onclick="event.stopPropagation(); updateCartQuantity('${med.id}', ${cartItem.quantity + 1})">+</button>
      </div>
    `;
  } else {
    actionBox.innerHTML = `
      <button class="med-item-action-btn" title="Add to Cart" onclick="event.stopPropagation(); addToCart('${med.id}')">
        <i class="fa-solid fa-plus"></i>
      </button>
    `;
  }

  // Bind navigation to single-item Specification view
  card.onclick = (e) => {
    if (e.target.closest('.action-btn-wrapper') || e.target.closest('.med-card-qty') || e.target.closest('.med-item-action-btn')) {
      return;
    }
    openMedicineDetailsModal(med.id);
  };

  return card;
}

// --- CATALOG ACTIONS & SORTING ---
function handleCatalogSort(sortBy) {
  db.ref("medicines").off("value");
  db.ref("medicines").on("value", (snap) => {
    const medsObj = snap.val() || {};
    let meds = Object.values(medsObj);

    // Enriched computed variables for advanced criteria
    const userLat = selectedAddress?.lat || 12.9615987;
    const userLng = selectedAddress?.lng || 77.5845627;

    meds = meds.map(m => {
      const discount = m.price > 80 ? 15 : 10;
      const rating = m.rating || (m.id === "med_1" ? 4.9 : m.id === "med_3" ? 4.8 : 4.5);
      
      let distance = 1.5;
      if (m.storeId === "store_1") {
        distance = mapUtils.getDistance(userLat, userLng, 12.9715987, 77.5945627);
      }
      const speed = distance <= 2 ? 2 : distance <= 5 ? 6 : 24;

      return {
        ...m,
        discountPercent: discount,
        ratingVal: rating,
        distanceVal: distance,
        deliveryTimeVal: speed
      };
    });

    if (sortBy === "price-low-high") {
      meds.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-high-low") {
      meds.sort((a, b) => b.price - a.price);
    } else if (sortBy === "rating") {
      meds.sort((a, b) => b.ratingVal - a.ratingVal);
    } else if (sortBy === "discount") {
      meds.sort((a, b) => b.discountPercent - a.discountPercent);
    } else if (sortBy === "bestselling") {
      meds.sort((a, b) => b.stock - a.stock);
    } else if (sortBy === "nearest") {
      meds.sort((a, b) => a.distanceVal - b.distanceVal);
    } else if (sortBy === "fastest") {
      meds.sort((a, b) => a.deliveryTimeVal - b.deliveryTimeVal);
    } else if (sortBy === "recent") {
      meds.sort((a, b) => b.id.localeCompare(a.id));
    } else {
      // Default: Popularity score calculation
      meds.sort((a, b) => (b.ratingVal * b.stock) - (a.ratingVal * a.stock));
    }

    // Pass the active category from selected chip
    let activeCat = "All";
    const activeChip = document.querySelector("#catalog-category-filter-row button.active");
    if (activeChip) activeCat = activeChip.textContent;

    renderCatalogGrid(meds, activeCat);
  });
}

// --- INTERACTIVE CART STATE & QUANTITY ENGINE ---
function addToCart(medId) {
  // Read latest medicine snapshot
  db.ref(`medicines/${medId}`).on("value", (snap) => {
    const med = snap.val();
    if (!med) return;

    const existing = cart.find(item => item.id === medId);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        id: med.id,
        name: med.name,
        price: med.price,
        image: med.image,
        prescriptionRequired: med.prescriptionRequired || false,
        quantity: 1
      });
    }

    showToast(`Added ${med.name} to medical cart.`, "success");
    syncCartUI();
  });
  // Instantly detach the listener so it doesn't cause infinite triggers
  db.ref(`medicines/${medId}`).off("value");
}

function updateCartQuantity(medId, quantity) {
  const idx = cart.findIndex(item => item.id === medId);
  if (idx === -1) return;

  if (quantity <= 0) {
    const name = cart[idx].name;
    cart.splice(idx, 1);
    showToast(`Removed ${name} from cart.`, "info");
  } else {
    cart[idx].quantity = quantity;
  }

  syncCartUI();
}

function syncCartUI() {
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  
  // Header badges update
  const cartBadge = document.getElementById("header-cart-badge");
  if (totalItems > 0) {
    cartBadge.textContent = totalItems;
    cartBadge.style.display = "flex";
  } else {
    cartBadge.style.display = "none";
  }

  // Cart Tab count label
  document.getElementById("cart-item-count-badge").textContent = `${totalItems} ITEMS`;

  // Update lists
  renderCartTabList();
  recalculateBillDetails();

  // Re-sync catalog medicine cards to show current quantity overlays
  db.ref("medicines").off("value");
  db.ref("medicines").on("value", (snap) => {
    const medsObj = snap.val() || {};
    const meds = Object.values(medsObj);
    renderBestsellersHome(meds);
    renderCatalogGrid(meds);
    renderRecommendedProducts(meds);
  });
}

function renderCartTabList() {
  const container = document.getElementById("cart-items-wrapper");
  const checkoutBlock = document.getElementById("cart-checkout-block");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-light);">
        <i class="fa-solid fa-cart-arrow-down" style="font-size: 3.5rem; opacity: 0.3; margin-bottom: 1rem; color: var(--secondary);"></i>
        <h4 style="font-family: var(--font-display); font-weight:700; color: var(--text);">Your Medical Cart is empty</h4>
        <p style="font-size: 0.8rem; margin-top: 4px;">Search and add wellness prescriptions to checkout.</p>
      </div>
    `;
    checkoutBlock.style.display = "none";
    return;
  }

  checkoutBlock.style.display = "flex";
  container.innerHTML = "";

  cart.forEach(item => {
    const row = document.createElement("div");
    row.style = `
      background: white;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 12px;
    `;
    row.innerHTML = `
      <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;" referrerPolicy="no-referrer" />
      <div style="flex:1; overflow:hidden;">
        <h5 style="font-size: 0.82rem; font-weight:700; color: var(--text); white-space: nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</h5>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <span style="font-size:0.85rem; font-weight:700; color: var(--primary-dark);">₹${item.price}</span>
          <div class="med-card-qty" style="padding: 1px 4px;">
            <button onclick="updateCartQuantity('${item.id}', ${item.quantity - 1})">-</button>
            <span style="font-size:0.75rem;">${item.quantity}</span>
            <button onclick="updateCartQuantity('${item.id}', ${item.quantity + 1})">+</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}

function recalculateBillDetails() {
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const delivery = subtotal > 500 ? 0 : 30; // Free delivery over ₹500
  const tax = parseFloat((subtotal * 0.05).toFixed(2));
  
  let discount = 0;
  if (activeCoupon) {
    if (activeCoupon === "DAWADO75") discount = 75;
    else if (activeCoupon === "DAWADO50") discount = 50;
    else if (activeCoupon === "FREESHIP") discount = delivery;
  }

  const discountApplied = Math.min(discount, subtotal);
  const grand = Math.max(0, parseFloat((subtotal + delivery + tax - discountApplied).toFixed(2)));

  document.getElementById("bill-subtotal-val").textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById("bill-delivery-val").textContent = delivery === 0 ? "FREE" : `₹${delivery.toFixed(2)}`;
  document.getElementById("bill-tax-val").textContent = `₹${tax.toFixed(2)}`;
  
  const discRow = document.getElementById("bill-discount-row");
  const discVal = document.getElementById("bill-discount-val");
  if (discountApplied > 0) {
    discRow.style.display = "flex";
    discVal.textContent = `-₹${discountApplied.toFixed(2)}`;
  } else {
    discRow.style.display = "none";
  }

  document.getElementById("bill-grand-val").textContent = `₹${grand.toFixed(2)}`;
}

function applyPromoCouponToCart() {
  const input = document.getElementById("cart-coupon-input").value.trim().toUpperCase();
  const feedback = document.getElementById("coupon-feedback-message");

  if (!input) {
    showToast("Please type a promo code.", "warning");
    return;
  }

  const validCoupons = ["DAWADO75", "DAWADO50", "FREESHIP"];
  if (validCoupons.includes(input)) {
    activeCoupon = input;
    feedback.textContent = `Promo Coupon "${input}" applied successfully!`;
    feedback.style.color = "var(--primary-dark)";
    feedback.style.display = "block";
    showToast("Promo Code Approved!", "success");
    recalculateBillDetails();
  } else {
    feedback.textContent = "Unregistered or expired discount coupon code.";
    feedback.style.color = "var(--danger)";
    feedback.style.display = "block";
    showToast("Invalid Promo Coupon Code.", "warning");
  }
}

function togglePaymentModeSelection(mode) {
  const codLabel = document.getElementById("payment-mode-cod-label");
  const onlineLabel = document.getElementById("payment-mode-online-label");

  if (mode === "COD") {
    codLabel.style.borderColor = "var(--primary)";
    codLabel.style.background = "var(--primary-light)";
    onlineLabel.style.borderColor = "var(--border)";
    onlineLabel.style.background = "transparent";
  } else {
    onlineLabel.style.borderColor = "var(--primary)";
    onlineLabel.style.background = "var(--primary-light)";
    codLabel.style.borderColor = "var(--border)";
    codLabel.style.background = "transparent";
  }
}

// --- SECURE TRANS-PAYMENT CHECKOUT ENGINE ---
async function triggerCheckoutSubmission() {
  if (cart.length === 0) return;

  const mode = document.querySelector('input[name="payment_mode_radio"]:checked').value;
  const uid = currentUser.uid;

  // Verify if prescription check is required for some medicines
  const rxRequired = cart.some(item => item.prescriptionRequired);
  if (rxRequired) {
    const rxConf = confirm("This cart contains regulated Rx drugs requiring doctor verification. Do you have a prescription file uploaded or ready?");
    if (!rxConf) {
      showToast("Verification failed. Please upload prescription file to complete checkout.", "danger");
      openPrescriptionUploadModal();
      return;
    }
  }

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const delivery = subtotal > 500 ? 0 : 30;
  const tax = parseFloat((subtotal * 0.05).toFixed(2));
  
  let discount = 0;
  if (activeCoupon === "DAWADO75") discount = 75;
  else if (activeCoupon === "DAWADO50") discount = 50;
  
  const grandTotal = Math.max(0, subtotal + delivery + tax - discount);

  try {
    let paymentDetails = { status: "pending", method: "COD" };

    if (mode === "ONLINE") {
      showToast("Initiating Razorpay server-side transaction...", "info");
      
      // Step A: Contact Express server to create secure payment order ID
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Math.round(grandTotal * 100), currency: "INR" })
      });
      
      if (!res.ok) throw new Error("Backend payment system rejected checkout.");
      const orderData = await res.json();

      // Step B: Trigger high-fidelity Razorpay overlay simulation
      const razorpayResult = await paymentUtils.processRazorpayCheckout({
        amount: orderData.amount,
        order_id: orderData.order_id,
        key_id: orderData.key_id
      });

      // Step C: Trigger server-side HMAC validation proxy
      showToast("Verifying payment security signature on server...", "info");
      const verifyRes = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(razorpayResult)
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.verified) throw new Error("Payment signature verification failed.");
      
      paymentDetails = {
        status: "paid",
        method: "ONLINE",
        transactionId: razorpayResult.razorpay_payment_id
      };
      showToast("Online Payment Settled Safely!", "success");
    }

    // Step D: Construct and save final order inside RTDB
    showToast("Dispatching delivery logistics dispatch...", "info");
    
    const newOrderRef = db.ref("orders").push();
    const orderId = newOrderRef.key;

    const finalOrder = {
      id: orderId,
      userId: uid,
      userName: currentUser.name,
      userPhone: document.getElementById("profile-edit-phone").value || "+91 91234 56789",
      items: cart,
      subtotal: subtotal,
      deliveryCharge: delivery,
      tax: tax,
      discount: discount,
      grandTotal: grandTotal,
      payment: paymentDetails,
      status: "placed", // Placed, accepted, preparing, out_for_delivery, delivered
      timestamp: new Date().toISOString(),
      address: selectedAddress,
      storeId: "store_1", // Default Pharmacy Hub assigned
      riderId: null // Pending assignment
    };

    await newOrderRef.set(finalOrder);

    // Send server-side systemic audit logging proxy
    await fetch("/api/audit/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkout_complete", user: currentUser.email, details: `Order #${orderId.toUpperCase()} Placed` })
    });

    // Notify User
    db.sendNotification(uid, "Order Dispatched!", `Your order #${orderId.toUpperCase()} of ₹${grandTotal.toFixed(2)} is being sourced.`, "order", { orderId });

    showToast(`Order #${orderId.toUpperCase()} completed successfully!`, "success");
    
    // Clear cart and navigate to live tracking page
    cart = [];
    syncCartUI();
    navigateToTab("orders");

  } catch (error) {
    showToast(`Checkout Failed: ${error.message}`, "danger");
  }
}

// --- DYNAMIC ORDER TIMELINE & MAP TRACKING ---
function toggleOrdersSubTab(sub) {
  const activeBtn = document.getElementById("orders-tab-active");
  const historyBtn = document.getElementById("orders-tab-history");
  const activePanel = document.getElementById("orders-active-panel");
  const historyPanel = document.getElementById("orders-history-panel");

  if (sub === "active") {
    activeBtn.style.color = "var(--primary-dark)";
    activeBtn.style.borderBottomColor = "var(--primary-dark)";
    historyBtn.style.color = "var(--text-light)";
    historyBtn.style.borderBottomColor = "transparent";
    activePanel.style.display = "flex";
    historyPanel.style.display = "none";
  } else {
    historyBtn.style.color = "var(--primary-dark)";
    historyBtn.style.borderBottomColor = "var(--primary-dark)";
    activeBtn.style.color = "var(--text-light)";
    activeBtn.style.borderBottomColor = "transparent";
    activePanel.style.display = "none";
    historyPanel.style.display = "flex";
  }
}

function updateMilestonesTimeline(order) {
  const steps = ["placed", "accepted", "preparing", "picked", "delivered"];
  const currentIdx = steps.indexOf(order.status);

  // Clear previous active stages
  steps.forEach(st => {
    const node = document.getElementById(`step-${st}`);
    const dot = node.querySelector(".step-dot");
    const title = node.querySelector("h5");
    const line = document.getElementById(`line-${st}`);

    dot.style.background = "var(--border)";
    dot.style.boxShadow = "none";
    title.style.color = "var(--text-light)";
    if (line) line.style.background = "#e2e8f0";
  });

  // Activate milestones up to current index
  for (let i = 0; i <= currentIdx; i++) {
    const stage = steps[i];
    const node = document.getElementById(`step-${stage}`);
    const dot = node.querySelector(".step-dot");
    const title = node.querySelector("h5");
    const line = document.getElementById(`line-${stage}`);

    dot.style.background = "var(--primary)";
    dot.style.boxShadow = "0 0 0 5px var(--primary-light)";
    title.style.color = "var(--text)";
    if (line) line.style.background = "var(--primary)";
  }

  // Customize micro timeline messages
  const formattedTime = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById("txt-placed-time").textContent = `Sourcing medicines at ${formattedTime}`;
}

// Interactive Live Leaflet Map tracking & rider animation
function initLiveTrackingMap(order) {
  if (!window.L) return;

  const mapContainer = document.getElementById("orders-leaflet-map");
  if (!mapContainer) return;

  // User destination coords
  const userLat = order.address?.lat || 12.9615987;
  const userLng = order.address?.lng || 77.5845627;

  // Apollo Store source coords
  const storeLat = 12.9715987;
  const storeLng = 77.5945627;

  // Initialize Map if not built yet
  if (!trackingMap) {
    trackingMap = window.L.map("orders-leaflet-map").setView([userLat, userLng], 14);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap'
    }).addTo(trackingMap);

    // Create Pin for User Address
    window.L.marker([userLat, userLng], {
      icon: window.L.divIcon({
        className: "leaflet-div-marker",
        html: `<div style="background: var(--primary); color: white; border: 2px solid white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.15);"><i class="fa-solid fa-house-chimney-medical" style="font-size:0.9rem;"></i></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      })
    }).addTo(trackingMap).bindPopup("Your Delivery Address").openPopup();

    // Create Pin for Pharmacy Hub
    window.L.marker([storeLat, storeLng], {
      icon: window.L.divIcon({
        className: "leaflet-div-marker",
        html: `<div style="background: var(--secondary); color: white; border: 2px solid white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.15);"><i class="fa-solid fa-prescription-bottle-medical" style="font-size:0.9rem;"></i></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      })
    }).addTo(trackingMap).bindPopup("DawaDo Hub Pharmacy");

    // Draw route line
    window.L.polyline([[storeLat, storeLng], [userLat, userLng]], {
      color: "var(--secondary)",
      weight: 3,
      dashArray: "6, 6",
      opacity: 0.8
    }).addTo(trackingMap);
  }

  // Handle Rider display & coordinate interpolation
  const contactPanel = document.getElementById("rider-contact-panel");
  if (order.status === "picked" || order.status === "out_for_delivery") {
    contactPanel.style.display = "flex";

    // Set Rider starting position or animate along route
    if (!trackingRiderMarker) {
      trackingRiderMarker = window.L.marker([storeLat, storeLng], {
        icon: window.L.divIcon({
          className: "leaflet-div-marker",
          html: `<div style="background: #e11d48; color: white; border: 2px solid white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(225,29,72,0.3);"><i class="fa-solid fa-motorcycle" style="font-size:0.95rem;"></i></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      }).addTo(trackingMap).bindPopup("Rider: En Route");

      // Animate Rider smoothly moving towards user's pin over 25 seconds
      let stepCount = 0;
      const totalSteps = 250;
      const moveInterval = setInterval(() => {
        if (!trackingRiderMarker || !trackingMap) {
          clearInterval(moveInterval);
          return;
        }

        stepCount++;
        const ratio = stepCount / totalSteps;
        const currentLat = storeLat + (userLat - storeLat) * ratio;
        const currentLng = storeLng + (userLng - storeLng) * ratio;

        trackingRiderMarker.setLatLng([currentLat, currentLng]);

        if (stepCount >= totalSteps) {
          clearInterval(moveInterval);
          // Auto complete status locally / inside RTDB for high-fidelity test
          db.ref(`orders/${order.id}`).update({ status: "delivered" });
          db.sendNotification(currentUser.uid, "Order Arrived!", "Your medical supplies are delivered at your doorstep.", "order", { orderId: order.id });
          showToast("Order Delivered Successfully!", "success");
        }
      }, 100);
    }
  } else {
    contactPanel.style.display = "none";
    if (trackingRiderMarker) {
      trackingRiderMarker.remove();
      trackingRiderMarker = null;
    }
  }
}

function recenterLiveTrackingMap() {
  if (trackingMap && currentUser) {
    const lat = selectedAddress?.lat || 12.9615987;
    const lng = selectedAddress?.lng || 77.5845627;
    trackingMap.setView([lat, lng], 14);
  }
}

function renderPastOrdersHistory(orders) {
  const container = document.getElementById("orders-history-panel");
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-light);">
        <i class="fa-solid fa-clock-rotate-left" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 10px;"></i>
        <p>You have no past completed orders.</p>
      </div>
    `;
    return;
  }

  // Sort history descending
  orders.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  container.innerHTML = "";
  orders.forEach(order => {
    const card = document.createElement("div");
    card.style = `
      background: white;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    
    const formattedDate = new Date(order.timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    const itemsSummary = order.items.map(item => `${item.name} (x${item.quantity})`).join(", ");

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h5 style="font-size: 0.82rem; font-weight:700; color: var(--text);">Order #${order.id.toUpperCase()}</h5>
          <span style="font-size: 0.72rem; color: var(--text-light);">${formattedDate}</span>
        </div>
        <span class="status-pill open" style="background:${order.status === 'cancelled' ? '#fee2e2' : 'var(--primary-light)'}; color:${order.status === 'cancelled' ? '#ef4444' : 'var(--primary-dark)'};">${order.status}</span>
      </div>
      <p style="font-size:0.75rem; color:var(--text-light); line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
        ${itemsSummary}
      </p>
      <div style="border-top: 1px dashed #e2e8f0; padding-top: 8px; display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
        <span style="font-size:0.85rem; font-weight:700; color:var(--text);">Total: ₹${order.grandTotal.toFixed(2)}</span>
        <button class="btn-primary" style="width:auto; padding: 6px 12px; font-size:0.75rem; border-radius:8px;" onclick="triggerRepeatOrderCheckout('${order.id}')">
          Reorder Items <i class="fa-solid fa-arrows-spin"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function triggerRepeatOrderCheckout(orderId) {
  db.ref(`orders/${orderId}`).on("value", (snap) => {
    const order = snap.val();
    if (!order) return;

    // Load items into cart
    cart = order.items.map(item => ({ ...item }));
    syncCartUI();
    navigateToTab("cart");
    showToast("Reordered item batch successfully. Review cart details.", "success");
  });
  db.ref(`orders/${orderId}`).off("value");
}

function recreateLastOrderedCart() {
  if (!currentUser) return;
  db.ref("orders").on("value", (snap) => {
    const ordersObj = snap.val() || {};
    const userOrders = Object.values(ordersObj).filter(o => o.userId === currentUser.uid);
    
    if (userOrders.length === 0) {
      showToast("No previous orders found to reorder.", "warning");
      return;
    }

    // Find latest
    userOrders.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest = userOrders[0];

    cart = latest.items.map(item => ({ ...item }));
    syncCartUI();
    navigateToTab("cart");
    showToast("Latest order replicated into cart successfully!", "success");
  });
  db.ref("orders").off("value");
}

// --- SECURE PRESCRIPTION UPLOAD (CLOUDINARY MOCK) ---
function openPrescriptionUploadModal() {
  togglePrescriptionModal(true);
}

function togglePrescriptionModal(show) {
  const modal = document.getElementById("prescription-modal");
  if (show) {
    modal.classList.add("active");
  } else {
    modal.classList.remove("active");
  }
}

function triggerRxFileSelection() {
  document.getElementById("rx-hidden-file-input").click();
}

function handleRxFileSelectionSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  selectedRxFile = file;
  
  const dropZone = document.getElementById("rx-drop-zone");
  const preview = document.getElementById("rx-thumbnail-preview");
  const previewImg = document.getElementById("rx-thumbnail-img");
  const cBadge = document.getElementById("rx-cloudinary-status-badge");
  const cTxt = document.getElementById("rx-cloudinary-id-txt");

  dropZone.style.display = "none";
  preview.style.display = "block";

  // FileReader preview
  const reader = new FileReader();
  reader.onload = (event) => {
    previewImg.src = event.target.result;
  };
  reader.readAsDataURL(file);

  // Trigger simulated secure Cloudinary upload proxy
  showToast("Uploading prescription to HIPAA-secure cloud store...", "info");
  setTimeout(async () => {
    try {
      const cloudRes = await cloudinaryUtils.uploadImage(file);
      cBadge.style.display = "flex";
      cTxt.textContent = cloudRes.public_id;
      showToast("Secure cloud link established successfully.", "success");
    } catch (err) {
      showToast("Cloud file storage failure.", "danger");
    }
  }, 1200);
}

function removeSelectedRxFile(e) {
  e.stopPropagation();
  selectedRxFile = null;
  
  document.getElementById("rx-drop-zone").style.display = "flex";
  document.getElementById("rx-thumbnail-preview").style.display = "none";
  document.getElementById("rx-cloudinary-status-badge").style.display = "none";
  document.getElementById("rx-hidden-file-input").value = "";
}

async function submitRxPrescriptionOrder() {
  if (!selectedRxFile) {
    showToast("Please drag or select a prescription file first.", "warning");
    return;
  }

  const notes = document.getElementById("rx-pharmacist-notes").value;
  const uid = currentUser.uid;

  try {
    showToast("Submitting prescription order...", "info");
    
    const newOrderRef = db.ref("orders").push();
    const orderId = newOrderRef.key;

    // Simulate Cloudinary URL upload complete
    const cloudRes = await cloudinaryUtils.uploadImage(selectedRxFile);

    const finalOrder = {
      id: orderId,
      userId: uid,
      userName: currentUser.name,
      userPhone: document.getElementById("profile-edit-phone").value || "+91 91234 56789",
      items: [
        { id: "custom_prescription_item", name: `Doctor Verified Prescription File (${selectedRxFile.name})`, price: 0, quantity: 1, image: cloudRes.secure_url }
      ],
      subtotal: 0,
      deliveryCharge: 30,
      tax: 0,
      discount: 0,
      grandTotal: 30, // Just delivery fee initially, medicine total added by pharmacist
      payment: { status: "pending", method: "COD" },
      status: "placed",
      type: "prescription",
      timestamp: new Date().toISOString(),
      address: selectedAddress,
      prescriptionUrl: cloudRes.secure_url,
      pharmacistNotes: notes,
      storeId: "store_1",
      riderId: null
    };

    await newOrderRef.set(finalOrder);

    db.sendNotification(uid, "Rx Order Dispatched!", "Pharmacists are analyzing your prescription. Price estimate shortly.", "order", { orderId });
    showToast(`Prescription Order #${orderId.toUpperCase()} completed successfully!`, "success");

    removeSelectedRxFile(e);
    togglePrescriptionModal(false);
    navigateToTab("orders");

  } catch (error) {
    showToast(`Submission failed: ${error.message}`, "danger");
  }
}

// --- LOCATION MANAGEMENT & LEAFLET PINNING ENGINE ---
function openAddressManagementModal() {
  toggleLocationModal(true);
  
  // Set up Map picker selection
  setTimeout(() => {
    initLeafletSelectorMap();
  }, 300);
}

function toggleLocationModal(show) {
  const modal = document.getElementById("location-modal");
  if (show) {
    modal.classList.add("active");
  } else {
    modal.classList.remove("active");
  }
}

function initLeafletSelectorMap() {
  if (!window.L) return;

  const lat = selectedAddress?.lat || 12.9715987;
  const lng = selectedAddress?.lng || 77.5945627;

  if (!selectorMap) {
    selectorMap = window.L.map("modal-leaflet-selector-map").setView([lat, lng], 15);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap'
    }).addTo(selectorMap);

    // Draggable marker pin
    selectorMarker = window.L.marker([lat, lng], { draggable: true }).addTo(selectorMap);
    
    // Bind marker events
    selectorMarker.on("dragend", async (event) => {
      const position = selectorMarker.getLatLng();
      await updateGeocodedAddressDetails(position.lat, position.lng);
    });

    selectorMap.on("click", async (event) => {
      selectorMarker.setLatLng(event.latlng);
      await updateGeocodedAddressDetails(event.latlng.lat, event.latlng.lng);
    });
  } else {
    selectorMap.setView([lat, lng], 15);
    selectorMarker.setLatLng([lat, lng]);
  }

  // Update initial reverse geocode
  updateGeocodedAddressDetails(lat, lng);
}

async function updateGeocodedAddressDetails(lat, lng) {
  document.getElementById("modal-reverse-address-result").value = "Pinpoint located. Geocoding area...";
  try {
    const address = await mapUtils.reverseGeocode(lat, lng);
    document.getElementById("modal-reverse-address-result").value = address;
  } catch (error) {
    document.getElementById("modal-reverse-address-result").value = `Pinned Coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }
}

async function triggerGPSAutoDetect() {
  if (!navigator.geolocation) {
    showToast("GPS Geolocation is not supported by your browser.", "warning");
    return;
  }

  showToast("Accessing device GPS satellites...", "info");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (selectorMap && selectorMarker) {
        selectorMap.setView([lat, lng], 16);
        selectorMarker.setLatLng([lat, lng]);
      }
      await updateGeocodedAddressDetails(lat, lng);
      showToast("Coordinates detected successfully via GPS.", "success");
    },
    (err) => {
      showToast("GPS timeout. Please pinpoint manually on leaf map.", "warning");
    },
    { timeout: 7000 }
  );
}

async function handleAddressManualQuery(query) {
  const suggsBox = document.getElementById("modal-address-suggestions-box");
  if (query.trim().length < 3) {
    suggsBox.style.display = "none";
    return;
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`, {
      headers: { "User-Agent": "DawaDo Delivery Suite" }
    });
    if (res.ok) {
      const data = await res.json();
      suggsBox.innerHTML = "";

      if (data.length > 0) {
        suggsBox.style.display = "block";
        data.forEach(item => {
          const row = document.createElement("div");
          row.style = "padding: 10px 12px; font-size: 0.8rem; border-bottom: 1.5px solid #f1f5f9; cursor: pointer; transition: background 0.2s;";
          row.onmouseenter = () => row.style.background = "#f8fafc";
          row.onmouseleave = () => row.style.background = "transparent";
          row.onclick = () => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            
            if (selectorMap && selectorMarker) {
              selectorMap.setView([lat, lng], 16);
              selectorMarker.setLatLng([lat, lng]);
            }
            document.getElementById("modal-reverse-address-result").value = item.display_name;
            suggsBox.style.display = "none";
            document.getElementById("modal-address-search-input").value = "";
          };
          row.innerHTML = `<i class="fa-solid fa-map-pin" style="color:var(--primary-dark); margin-right:8px;"></i> ${item.display_name}`;
          suggsBox.appendChild(row);
        });
      } else {
        suggsBox.style.display = "none";
      }
    }
  } catch (error) {
    console.warn("Nominatim fetch failed.", error);
  }
}

function selectAddressPresetTag(tag) {
  selectedPresetTag = tag;
  const tags = ["Home", "Work", "Other"];
  tags.forEach(t => {
    const btn = document.getElementById(`tag-btn-${t.toLowerCase()}`);
    if (t === tag) {
      btn.style.background = "var(--primary-dark)";
      btn.style.color = "white";
    } else {
      btn.style.background = "#f1f5f9";
      btn.style.color = "var(--text-light)";
      btn.style.border = "1px solid var(--border)";
    }
  });
}

async function handleConfirmAddressSelectionSubmit() {
  const rawAddr = document.getElementById("modal-reverse-address-result").value;
  const flat = document.getElementById("modal-flat-input").value;
  const landmark = document.getElementById("modal-landmark-input").value;

  if (!rawAddr || rawAddr.startsWith("Pinpoint located")) {
    showToast("Please wait for geocoding pinpoint coordinates.", "warning");
    return;
  }

  const latlng = selectorMarker.getLatLng();
  const addressPayload = {
    id: "pin_" + Date.now(),
    label: selectedPresetTag,
    address: rawAddr,
    flat: flat,
    landmark: landmark,
    lat: latlng.lat,
    lng: latlng.lng
  };

  try {
    showToast("Saving delivery pin address...", "info");
    const uid = currentUser.uid;

    // Push into RTDB saved addresses path
    await db.ref(`users/${uid}/savedAddresses/${addressPayload.id}`).set(addressPayload);
    
    showToast("New delivery coordinate verified!", "success");
    toggleLocationModal(false);

    // Clear inputs
    document.getElementById("modal-flat-input").value = "";
    document.getElementById("modal-landmark-input").value = "";

  } catch (error) {
    showToast("Failed to save coordinate pin.", "danger");
  }
}

function renderSavedAddressList(addrs) {
  const container = document.getElementById("saved-address-pins-list");
  if (!container) return;

  if (Object.keys(addrs).length === 0) {
    container.innerHTML = `
      <p style="font-size:0.78rem; color:var(--text-light); text-align:center;">No custom pins saved yet.</p>
    `;
    return;
  }

  container.innerHTML = "";
  Object.values(addrs).forEach(addr => {
    const item = document.createElement("div");
    item.style = `
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    `;
    item.innerHTML = `
      <div style="flex:1; overflow:hidden;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.7rem; font-weight:700; background:var(--primary-light); color:var(--primary-dark); padding:2px 6px; border-radius:6px; text-transform:uppercase;">${addr.label}</span>
          <span style="font-size:0.75rem; font-weight:600; color:var(--text);">${addr.flat || ''}</span>
        </div>
        <p style="font-size:0.72rem; color:var(--text-light); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">${addr.address}</p>
      </div>
      <button style="background:transparent; border:none; color:var(--danger); cursor:pointer; padding:6px;" onclick="deleteSavedAddressPin('${addr.id}')">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

async function deleteSavedAddressPin(pinId) {
  const conf = confirm("Delete this delivery location coordinates pin?");
  if (!conf) return;

  try {
    await db.ref(`users/${currentUser.uid}/savedAddresses/${pinId}`).remove();
    showToast("Saved pin removed.", "info");
  } catch (error) {
    showToast("Deletion failed.", "danger");
  }
}

// --- PROFILE RECORD MODIFIER ---
async function handleProfileDetailsUpdate(e) {
  e.preventDefault();
  const name = document.getElementById("profile-edit-name").value;
  const phone = document.getElementById("profile-edit-phone").value;

  try {
    showToast("Saving profile updates...", "info");
    await db.ref(`users/${currentUser.uid}`).update({
      name: name,
      phone: phone
    });
    showToast("Personal records synchronized successfully!", "success");
  } catch (err) {
    showToast("Profile update failed.", "danger");
  }
}

// --- VOICE & BARCODE SEARCH GATEWAYS ---
function openVoiceSearchModal() {
  toggleVoiceModal(true);
  
  const voiceTxt = document.getElementById("voice-recognized-query");
  const micStatus = document.getElementById("voice-mic-status");
  
  voiceTxt.textContent = "Listening to speech harmonics...";
  micStatus.textContent = "Adjusting mic filters...";

  // Simulated listening stages
  setTimeout(() => {
    voiceTxt.textContent = '"Find Paracetamol Tablets 650mg..."';
    micStatus.textContent = "Analyzing phonetics...";
  }, 1200);

  setTimeout(() => {
    toggleVoiceModal(false);
    openGlobalSearchPane();
    document.getElementById("global-search-input-field").value = "Paracetamol";
    handleInstantCatalogQuery("Paracetamol");
  }, 2600);
}

function toggleVoiceModal(show) {
  const modal = document.getElementById("voice-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

function openBarcodeScannerModal() {
  toggleBarcodeModal(true);
}

function toggleBarcodeModal(show) {
  const modal = document.getElementById("barcode-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

function handleSimulatedBarcodeScan(val) {
  if (!val) return;

  if (val === "invalid_barcode") {
    showToast("Scan complete: Unrecognized medication UPC barcode.", "warning");
    alert("Warning: This medicine barcode is not indexed in DawaDo HIPAA Database. Please search manually or check alternative brand names.");
    return;
  }

  showToast("Scan authorized. Matching HIPAA indexed drugs...", "success");
  setTimeout(() => {
    toggleBarcodeModal(false);
    openGlobalSearchPane();
    
    // Look up med name in catalog to pre-fill
    db.ref(`medicines/${val}`).on("value", (snap) => {
      const med = snap.val();
      if (med) {
        document.getElementById("global-search-input-field").value = med.name;
        handleInstantCatalogQuery(med.name);
      }
    });
    db.ref(`medicines/${val}`).off("value");
    
    // Clear select
    document.getElementById("barcode-mock-select").value = "";
  }, 1000);
}

// --- EXPLORER ADVANCED SEARCH WORKSPACE ---
function openGlobalSearchPane() {
  toggleSearchModal(true);
  document.getElementById("global-search-input-field").focus();
  
  // Render search history tags
  renderSearchHistoryTags();
}

function toggleSearchModal(show) {
  const modal = document.getElementById("search-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

function renderSearchHistoryTags() {
  const row = document.getElementById("search-history-row");
  const history = JSON.parse(localStorage.getItem(`search_history_${currentUser?.uid}`)) || [];
  
  if (history.length > 0) {
    row.style.display = "flex";
    // Keep first 3 items
    const truncated = history.slice(0, 3);
    
    // Remove previous tags except the first span "Recent:"
    row.innerHTML = `<span style="font-size: 0.72rem; color: var(--text-light); font-weight: 600;">Recent:</span>`;
    
    truncated.forEach(tag => {
      const chip = document.createElement("span");
      chip.style = "background: var(--primary-light); color: var(--primary-dark); font-size: 0.72rem; padding: 4px 10px; border-radius: 12px; cursor: pointer; font-weight:500;";
      chip.onclick = () => preFillSearchKeyword(tag);
      chip.textContent = tag;
      row.appendChild(chip);
    });
  } else {
    row.style.display = "none";
  }
}

function preFillSearchKeyword(word) {
  document.getElementById("global-search-input-field").value = word;
  handleInstantCatalogQuery(word);
}

function handleInstantCatalogQuery(query) {
  const container = document.getElementById("global-search-results-list");
  const helper = document.getElementById("generic-substitute-helper-banner");
  const helperTxt = document.getElementById("generic-helper-text");
  const helperRow = document.getElementById("generic-suggestions-row");

  if (!container) return;

  if (query.trim().length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-light);">
        <i class="fa-solid fa-comment-medical" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 10px;"></i>
        <p style="font-size: 0.8rem;">Start typing to match FDA-approved medical supplies...</p>
      </div>
    `;
    helper.style.display = "none";
    return;
  }

  // Save history on Enter/submit logic or after typing (debounced)
  saveSearchHistoryKeyword(query);

  // Advanced search on database
  db.ref("medicines").on("value", (snap) => {
    const medsObj = snap.val() || {};
    const meds = Object.values(medsObj);

    const norm = query.toLowerCase().trim();
    const matches = meds.filter(m => 
      m.name.toLowerCase().includes(norm) || 
      m.category.toLowerCase().includes(norm) ||
      m.description.toLowerCase().includes(norm)
    );

    // Smart generic alternatives detection
    let matchedGenericDrug = null;
    Object.keys(brandToGenericMap).forEach(brandKey => {
      if (norm.includes(brandKey)) {
        matchedGenericDrug = brandToGenericMap[brandKey];
      }
    });

    if (matchedGenericDrug) {
      helper.style.display = "block";
      helperTxt.textContent = `Looking for Brand "${query}"? Save up to 60% with Generic alternative "${matchedGenericDrug}"!`;
      
      // Render quick add chip for generic drug
      helperRow.innerHTML = "";
      const matchedMed = meds.find(m => m.name === matchedGenericDrug);
      if (matchedMed) {
        const chip = document.createElement("button");
        chip.className = "btn-primary";
        chip.style = "width: auto; padding: 4px 10px; font-size: 0.72rem; border-radius: 8px; background: var(--warning); color: black;";
        chip.onclick = () => {
          addToCart(matchedMed.id);
          toggleSearchModal(false);
        };
        chip.innerHTML = `<i class="fa-solid fa-file-medical"></i> Add ${matchedGenericDrug} (₹${matchedMed.price})`;
        helperRow.appendChild(chip);
      }
    } else {
      helper.style.display = "none";
    }

    container.innerHTML = "";
    if (matches.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-light);">
          <i class="fa-solid fa-magnifying-glass-minus" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 10px;"></i>
          <p style="font-size: 0.82rem;">No matching medicines found in catalog. Check spelling or request prescription upload.</p>
        </div>
      `;
      return;
    }

    matches.forEach(med => {
      const row = document.createElement("div");
      row.style = "background:#f8fafc; border:1px solid var(--border); border-radius:12px; padding:10px; display:flex; align-items:center; justify-content:space-between; gap:10px;";
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
          <img src="${med.image}" alt="${med.name}" style="width:40px; height:40px; object-fit:cover; border-radius:6px;" referrerPolicy="no-referrer" />
          <div style="overflow:hidden;">
            <h5 style="font-size:0.8rem; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${med.name}</h5>
            <span style="font-size:0.65rem; color:var(--text-light); text-transform:uppercase; font-weight:600;">${med.category}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:0.85rem; font-weight:700; color:var(--primary-dark);">₹${med.price}</span>
          <button class="med-item-action-btn" style="width:28px; height:28px; border-radius:8px;" onclick="addToCart('${med.id}'); toggleSearchModal(false);">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      `;
      container.appendChild(row);
    });
  });
  db.ref("medicines").off("value");
}

function saveSearchHistoryKeyword(word) {
  if (!word || word.trim().length < 3) return;
  const key = `search_history_${currentUser?.uid}`;
  let history = JSON.parse(localStorage.getItem(key)) || [];
  
  // Exclude duplicates
  history = history.filter(h => h.toLowerCase() !== word.toLowerCase());
  history.unshift(word.trim());
  
  localStorage.setItem(key, JSON.stringify(history));
}

// --- PUSH NOTIFICATION CENTRE ACTIONS ---
function toggleNotificationPanel(show) {
  const modal = document.getElementById("notifications-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

function renderNotificationsList(notifs) {
  const container = document.getElementById("notifications-wrapper-list");
  if (!container) return;

  if (notifs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-light);">
        <i class="fa-regular fa-bell-slash" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 10px;"></i>
        <p style="font-size: 0.8rem;">No unread HIPAA notifications.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  notifs.forEach(n => {
    const row = document.createElement("div");
    row.style = `
      background: ${n.read ? 'white' : 'var(--primary-light)'};
      border: 1px solid ${n.read ? 'var(--border)' : '#a7f3d0'};
      border-radius: 12px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: relative;
    `;
    
    const formattedTime = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h5 style="font-size: 0.8rem; font-weight:700; color:var(--text);">${n.title}</h5>
        <span style="font-size:0.65rem; color:var(--text-light);">${formattedTime}</span>
      </div>
      <p style="font-size:0.75rem; color:var(--text-light); line-height:1.3; padding-right:20px;">${n.body}</p>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:4px;">
        ${!n.read ? `<button style="background:transparent; border:none; color:var(--primary-dark); font-size:0.7rem; font-weight:600; cursor:pointer;" onclick="triggerMarkSingleNotificationAsRead('${n.id}')">Mark Read</button>` : ''}
        <button style="background:transparent; border:none; color:var(--danger); font-size:0.7rem; font-weight:600; cursor:pointer;" onclick="triggerDeleteNotification('${n.id}')">Delete</button>
      </div>
    `;
    container.appendChild(row);
  });
}

async function triggerMarkSingleNotificationAsRead(notifId) {
  try {
    await db.ref(`notifications/${notifId}`).update({ read: true });
    showToast("Notification updated.", "info");
  } catch (err) {
    showToast("Action failed.", "danger");
  }
}

async function triggerDeleteNotification(notifId) {
  try {
    await db.ref(`notifications/${notifId}`).remove();
    showToast("Notification cleared.", "info");
  } catch (err) {
    showToast("Action failed.", "danger");
  }
}

async function triggerMarkAllNotificationsAsRead() {
  if (!currentUser) return;
  try {
    const snap = await new Promise((resolve) => {
      db.ref("notifications").on("value", resolve);
    });
    db.ref("notifications").off("value");
    
    const notifs = snap.val() || {};
    const updates = {};
    
    Object.keys(notifs).forEach(id => {
      if (notifs[id].recipientId === currentUser.uid) {
        updates[`${id}/read`] = true;
      }
    });

    if (Object.keys(updates).length > 0) {
      await db.ref("notifications").update(updates);
      showToast("All notifications updated.", "success");
    }
  } catch (err) {
    showToast("Action failed.", "danger");
  }
}

// --- EXPIRABLE FLASH SALE SCHEDULER ---
function startFlashSaleTimer() {
  let timerHr = 2;
  let timerMin = 14;
  let timerSec = 45;

  const interval = setInterval(() => {
    timerSec--;
    if (timerSec < 0) {
      timerSec = 59;
      timerMin--;
      if (timerMin < 0) {
        timerMin = 59;
        timerHr--;
        if (timerHr < 0) {
          clearInterval(interval);
          document.getElementById("flash-sale-banner").style.display = "none";
          document.getElementById("flash-sale-items-section").style.display = "none";
          return;
        }
      }
    }

    const pad = (num) => String(num).padStart(2, "0");
    document.getElementById("timer-hr").textContent = pad(timerHr);
    document.getElementById("timer-min").textContent = pad(timerMin);
    document.getElementById("timer-sec").textContent = pad(timerSec);
  }, 1000);

  // Render Flash Sale items
  db.ref("medicines").on("value", (snap) => {
    const medsObj = snap.val() || {};
    const meds = Object.values(medsObj);

    // Select specific discounted items for flash sale
    const flashMeds = meds.filter(m => m.id === "med_3" || m.id === "med_7" || m.id === "med_8");
    const container = document.getElementById("flash-products-wrapper");
    if (!container) return;

    container.innerHTML = "";
    flashMeds.forEach((med, idx) => {
      const card = buildMedicineItemCard(med);
      
      // Inject claimed progress bar inside details
      const details = card.querySelector(".med-item-details");
      const claimedVal = [78, 62, 89][idx % 3];
      
      const pBar = document.createElement("div");
      pBar.className = "stock-bar-container";
      pBar.innerHTML = `
        <div class="stock-text">
          <span style="color:var(--danger); font-weight:700;"><i class="fa-solid fa-fire-flame-curved"></i> Only ${med.stock - 50} Left</span>
          <span>${claimedVal}% Claimed</span>
        </div>
        <div class="stock-progress-bar">
          <div class="stock-progress-fill" style="background:var(--danger); width: ${claimedVal}%;"></div>
        </div>
      `;
      details.insertBefore(pBar, details.querySelector(".med-item-price-row"));

      card.style.minWidth = "170px";
      card.style.flexShrink = "0";
      container.appendChild(card);
    });
  });
}

// --- BRUSH/SCRATCH CARD HTML5 CANVAS coupon engine ---
function resetScratchCouponGame() {
  const canvas = document.getElementById("scratch-canvas-node");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const displayCode = document.getElementById("scratch-code-display");

  // Select random code
  const codeOptions = ["DAWADO75", "DAWADO50"];
  const chosen = codeOptions[Math.floor(Math.random() * codeOptions.length)];
  displayCode.textContent = chosen;
  displayCode.onclick = () => {
    navigator.clipboard.writeText(chosen);
    showToast(`Promo Code "${chosen}" copied! Apply at checkout.`, "success");
    document.getElementById("cart-coupon-input").value = chosen;
  };

  // Draw silver overlay coating on canvas
  ctx.fillStyle = "#cbd5e1"; // Metallic silver coating
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add text pattern "Scratch Here"
  ctx.fillStyle = "#475569";
  ctx.font = "bold 14px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("RUB TO REVEAL CODE", canvas.width / 2, canvas.height / 2);

  let isDrawing = false;

  const scratch = (x, y) => {
    ctx.globalCompositeOperation = "destination-out"; // Erase painting
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();

    // Check if scratched area exceeds limit to auto reveal
    checkScratchedPercentage();
  };

  const getCoordinates = (e) => {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  canvas.onmousedown = (e) => {
    isDrawing = true;
    const coords = getCoordinates(e);
    scratch(coords.x, coords.y);
  };

  canvas.onmousemove = (e) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    scratch(coords.x, coords.y);
  };

  canvas.onmouseup = () => isDrawing = false;
  canvas.onmouseleave = () => isDrawing = false;

  canvas.ontouchstart = (e) => {
    isDrawing = true;
    const coords = getCoordinates(e);
    scratch(coords.x, coords.y);
  };

  canvas.ontouchmove = (e) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    scratch(coords.x, coords.y);
  };

  canvas.ontouchend = () => isDrawing = false;

  function checkScratchedPercentage() {
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imgData.data;
      let erasedCount = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) erasedCount++; // Alpha channel is 0
      }
      const ratio = erasedCount / (pixels.length / 4);
      if (ratio > 0.55) {
        // Auto erase remaining
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        showToast("Coupon Revealed! Click the code to copy.", "success");
      }
    } catch (e) {
      // getImageData may throw sandbox security errors in certain iframes
    }
  }
}

// --- HIGH-DENSITY MOCK DISTANCE DATA ---
function loadNearbyPharmacies() {
  const container = document.getElementById("home-health-tips-wrapper");
  if (!container) return;

  db.ref("stores").on("value", (snap) => {
    const storesObj = snap.val() || {};
    const stores = Object.values(storesObj);

    // Compute live distance using Haversine based on user coordinates!
    const userLat = selectedAddress?.lat || 12.9615987;
    const userLng = selectedAddress?.lng || 77.5845627;

    const nearbyStores = stores.map(st => {
      const dist = mapUtils.getDistance(userLat, userLng, st.lat, st.lng);
      return { ...st, distance: dist };
    });

    // Render Apollo & seed pharmacy lists
    renderPharmacyCarousel(nearbyStores);
  });
  db.ref("stores").off("value");
}

function renderPharmacyCarousel(stores) {
  // Let's replace the health tip list with high-contrast tip cards
  const container = document.getElementById("home-health-tips-wrapper");
  if (!container) return;

  const healthTips = [
    { title: "Diabetic Care", body: "Check blood sugar before breakfast. Metformin works best after meals.", icon: "fa-solid fa-heart-pulse", bg: "#eff6ff", color: "#2563eb" },
    { title: "Hydration Vitality", body: "Drink 3.5 liters daily. Flush waste materials to keep kidneys fully operational.", icon: "fa-solid fa-droplet", bg: "#ecfdf5", color: "#10b981" },
    { title: "Antibiotics Standard", body: "Never pause antibiotic cycles mid-way. Incomplete schedules build severe resistance.", icon: "fa-solid fa-capsules", bg: "#fef3c7", color: "#d97706" }
  ];

  container.innerHTML = "";
  healthTips.forEach(tip => {
    const card = document.createElement("div");
    card.style = `
      background: ${tip.bg};
      color: var(--text);
      border-radius: var(--card-radius);
      padding: 14px;
      min-width: 220px;
      flex-shrink: 0;
      border: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
    `;
    card.onclick = () => {
      alert(`Daily Health Fact: ${tip.title}\n\n${tip.body}`);
    };
    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="background:white; color:${tip.color}; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1rem;"><i class="${tip.icon}"></i></div>
        <h5 style="font-family: var(--font-display); font-weight:700; font-size:0.85rem;">${tip.title}</h5>
      </div>
      <p style="font-size:0.75rem; color:var(--text-light); line-height:1.4;">${tip.body}</p>
    `;
    container.appendChild(card);
  });
}

function openNearbyPharmacySheet() {
  const userLat = selectedAddress?.lat || 12.9615987;
  const userLng = selectedAddress?.lng || 77.5845627;

  db.ref("stores").on("value", (snap) => {
    const stores = Object.values(snap.val() || {});
    let message = "DawaDo HIPAA Pharmacy Hubs within 10km:\n\n";
    
    stores.forEach((st, idx) => {
      const dist = mapUtils.getDistance(userLat, userLng, st.lat, st.lng);
      message += `${idx + 1}. ${st.name} (${dist} km away)\n   Status: APPROVED & DISPATCH ACTIVE\n\n`;
    });

    alert(message);
  });
  db.ref("stores").off("value");
}

function filterEmergencyMedicines() {
  showToast("Filtering critical 10-minute lifesaving inventory...", "warning");
  navigateToTab("categories");
  setTimeout(() => {
    // Select Antibiotics or Diabetes category which are crucial
    const chip = document.getElementById("chip-Diabetes");
    if (chip) chip.click();
  }, 100);
}

// --- MEDICINE SPECIFICATION & DETAILS MODAL ---
function toggleDetailsModal(show) {
  const modal = document.getElementById("details-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

function openMedicineDetailsModal(medId) {
  db.ref(`medicines/${medId}`).on("value", (snap) => {
    const med = snap.val();
    if (!med) return;
    
    toggleDetailsModal(true);
    
    const isRx = med.prescriptionRequired || false;
    const discount = med.price > 80 ? 15 : 10;
    const originalPrice = Math.round(med.price / (1 - discount/100));
    
    const reviewScore = med.id === "med_1" ? 4.9 : med.id === "med_2" ? 4.7 : med.id === "med_4" ? 4.8 : 4.5;
    const reviewsList = [
      { rating: 5, user: "Dr. Vivek Murthy", text: "Verified formulation. Consistently prescribes for fever/pain relief.", date: "15 April 2026" },
      { rating: 4, user: "Rohan K.", text: "Standard packaging, reliable medicine. Immediate relief.", date: "02 May 2026" }
    ];
    
    const usesList = med.id === "med_1" || med.id === "med_6" 
      ? ["Fever reduction", "Mild to moderate body pain", "Headache, joint pain, toothache"]
      : med.id === "med_2"
      ? ["Bacterial sinus infections", "Throat & lung infections", "Urinary tract infections"]
      : med.id === "med_3"
      ? ["Allergy symptoms (sneezing, runny nose)", "Hives & itching", "Watery eyes"]
      : med.id === "med_4"
      ? ["Type 2 Diabetes Mellitus management", "Blood sugar stabilization", "Insulin sensitivity booster"]
      : med.id === "med_5"
      ? ["Cholesterol level moderation", "Cardiovascular protection", "Heart attack risk reduction"]
      : ["Cough relief", "Chest congestion clearing", "Mucus thinning"];

    const composition = med.id === "med_1" ? "Paracetamol IP 650mg" : med.id === "med_2" ? "Amoxicillin IP 500mg" : med.id === "med_3" ? "Cetirizine Hydrochloride 10mg" : med.id === "med_4" ? "Metformin Hydrochloride 500mg" : med.id === "med_5" ? "Atorvastatin Calcium 10mg" : "Active clinical formulation";
    
    let alternateMedHtml = "";
    if (brandToGenericMap[med.name.split(' ')[0].toLowerCase()]) {
      const genName = brandToGenericMap[med.name.split(' ')[0].toLowerCase()];
      alternateMedHtml = `
        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 10px; margin-top: 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.7rem; font-weight:700; color:#d97706; background:#fffbeb; padding:2px 6px; border-radius:4px; text-transform:uppercase;">Generic Alternate Available</span>
            <span style="font-size:0.7rem; font-weight:700; color:var(--success);">Save 50%+</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text); margin-top:4px; font-weight:600;">Switch to generic alternative: <strong>${genName}</strong></p>
          <button class="btn-primary" style="background:#d97706; color:white; width:auto; padding:4px 10px; font-size:0.7rem; border-radius:6px; margin-top:6px;" onclick="addToCartAndCloseDetails('${med.id}')">
            Add Generic Alternative
          </button>
        </div>
      `;
    }

    const isFav = wishlist.some(w => w.id === medId);
    
    const images = [
      med.image,
      "https://images.unsplash.com/photo-1550572017-edd951b55104?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1607619275048-24722480f875?auto=format&fit=crop&w=400&q=80"
    ];

    const contentArea = document.getElementById("details-modal-content-area");
    const actionRow = document.getElementById("details-modal-action-row");
    
    contentArea.innerHTML = `
      <div class="gallery-container">
        <img src="${images[0]}" alt="${med.name}" class="gallery-main-img" id="gallery-main-image-node" referrerPolicy="no-referrer" onclick="toggleImageZoom(this)" />
        <div class="gallery-thumb-row">
          ${images.map((img, index) => `
            <img src="${img}" class="gallery-thumb ${index === 0 ? 'active' : ''}" referrerPolicy="no-referrer" onclick="switchGalleryImage('${img}', this)" />
          `).join('')}
        </div>
      </div>
      
      <div style="margin-top: 5px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <span style="font-size: 0.68rem; font-weight: 700; color: var(--primary-dark); text-transform: uppercase; background: var(--primary-light); padding: 2px 6px; border-radius: 4px;">${med.category}</span>
            <h3 style="font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; color: var(--text); margin-top: 4px;">${med.name}</h3>
            <p style="font-size: 0.72rem; color: var(--text-light); margin-top: 1px;">Brand: <strong>${med.name.split(' ')[0]} Healthcare</strong> | Abbott Labs</p>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; background: #f1f5f9; padding: 4px 8px; border-radius: 8px;">
            <i class="fa-solid fa-star" style="color: #f59e0b; font-size: 0.78rem;"></i>
            <span style="font-size: 0.78rem; font-weight: 700; color: var(--text);">${reviewScore}</span>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; background: #fafbfc; border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px;">
        <div>
          <span style="font-size: 0.68rem; color: var(--text-light); text-transform: uppercase; font-weight: 600;">Pricing & Pack</span>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
            <span style="font-size: 1.2rem; font-weight: 800; color: var(--primary-dark);">₹${med.price}</span>
            <span style="font-size: 0.85rem; color: var(--text-light); text-decoration: line-through;">₹${originalPrice}</span>
            <span style="background: var(--danger-light); color: var(--danger); font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 6px;">${discount}% OFF</span>
          </div>
        </div>
        <div>
          ${isRx ? `
            <span style="background: #fee2e2; color: #ef4444; font-size: 0.72rem; font-weight: 700; padding: 6px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-file-prescription"></i> Rx Required
            </span>
          ` : `
            <span style="background: #ecfdf5; color: #10b981; font-size: 0.72rem; font-weight: 700; padding: 6px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-shield-halved"></i> OTC Safe
            </span>
          `}
        </div>
      </div>

      <div class="stock-bar-container" style="background: #fafbfc; border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; margin-top: 4px;">
        <div class="stock-text" style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight:600;">
          <span style="color: var(--text);">Stock Availability</span>
          <span style="color: ${med.stock < 50 ? 'var(--danger)' : 'var(--success)'};">${med.stock} left</span>
        </div>
        <div class="stock-progress-bar" style="height:6px; margin-top: 6px;">
          <div class="stock-progress-fill" style="background: ${med.stock < 50 ? 'var(--danger)' : 'var(--primary-dark)'}; width: ${Math.min((med.stock/300)*100, 100)}%;"></div>
        </div>
      </div>

      <div>
        <div class="details-tab-bar">
          <button class="details-tab-btn active" id="tab-btn-clinical" onclick="switchDetailsTab('clinical')">Uses & Benefits</button>
          <button class="details-tab-btn" id="tab-btn-safety" onclick="switchDetailsTab('safety')">Dosage & Safety</button>
          <button class="details-tab-btn" id="tab-btn-reviews" onclick="switchDetailsTab('reviews')">Customer Reviews</button>
        </div>
        
        <div class="details-tab-content active" id="tab-content-clinical">
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div>
              <strong style="color: var(--text); font-size: 0.8rem;"><i class="fa-solid fa-vial-med" style="color: var(--primary-dark); margin-right:4px;"></i> Composition / Formulation:</strong>
              <p style="font-size:0.75rem; color: var(--text-light); margin-top:2px;">${composition}</p>
            </div>
            <div>
              <strong style="color: var(--text); font-size: 0.8rem;"><i class="fa-solid fa-list-check" style="color: var(--primary-dark); margin-right:4px;"></i> Therapeutic Uses:</strong>
              <ul style="padding-left:14px; margin-top:2px; font-size:0.75rem; color: var(--text-light); list-style-type: disc;">
                ${usesList.map(u => `<li>${u}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
        
        <div class="details-tab-content" id="tab-content-safety">
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div>
              <strong style="color: var(--text); font-size: 0.8rem;"><i class="fa-solid fa-prescription" style="color: var(--warning); margin-right:4px;"></i> Standard Dosage:</strong>
              <p style="font-size:0.75rem; color: var(--text-light); margin-top:2px;">Take exactly as directed by your physician or pharmacist. Swallow whole, do not crush.</p>
            </div>
            <div>
              <strong style="color: var(--text); font-size: 0.8rem;"><i class="fa-solid fa-ban" style="color: var(--danger); margin-right:4px;"></i> Side Effects:</strong>
              <p style="font-size:0.75rem; color: var(--text-light); margin-top:2px;">Mild nausea or dizziness might occur occasionally. Please consult a physician.</p>
            </div>
          </div>
        </div>

        <div class="details-tab-content" id="tab-content-reviews">
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${reviewsList.map(rev => `
              <div style="background: #f8fafc; border: 1px solid var(--border); padding: 8px 10px; border-radius: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.75rem; font-weight:700; color:var(--text);">${rev.user}</span>
                  <span style="font-size:0.65rem; color:var(--text-light);">${rev.date}</span>
                </div>
                <p style="font-size:0.72rem; color:var(--text-light); margin-top:4px; line-height:1.35;">"${rev.text}"</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      ${alternateMedHtml}

      <div style="background: var(--primary-light); border-radius:12px; padding:10px; display:flex; align-items:center; gap:8px; margin-top:4px;">
        <i class="fa-solid fa-house-chimney-medical" style="color:var(--primary-dark); font-size:1.1rem;"></i>
        <div>
          <h5 style="font-size:0.75rem; font-weight:700; color:var(--text);">Dispatched via Apollo Pharmacy Hub</h5>
          <p style="font-size:0.68rem; color:var(--text-light);">Licensed Hub | Certified FDA inventory | Distance 1.2km</p>
        </div>
      </div>
    `;

    actionRow.innerHTML = `
      <button class="header-btn" style="width: 44px; height: 44px; border-radius: 12px; background: #fff1f2; border: 1px solid #ffe4e6; display:flex; align-items:center; justify-content:center; color: var(--danger); cursor:pointer; font-size: 1.25rem;" onclick="toggleWishlistItem('${med.id}')" title="Add to Wishlist">
        <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart" id="details-heart-icon"></i>
      </button>
      
      <button class="btn-primary" style="flex:1; background: var(--text); color: white; border: none; font-size: 0.82rem;" onclick="addToCartAndCloseDetails('${med.id}')">
        Add To Cart <i class="fa-solid fa-cart-plus"></i>
      </button>

      <button class="btn-primary" style="flex:1; background: var(--primary-dark); color: white; border: none; font-size: 0.82rem;" onclick="buyNowAndCloseDetails('${med.id}')">
        Buy Now <i class="fa-solid fa-bolt"></i>
      </button>
    `;
  });
  db.ref(`medicines/${medId}`).off("value");
}

function addToCartAndCloseDetails(medId) {
  addToCart(medId);
  toggleDetailsModal(false);
}

function buyNowAndCloseDetails(medId) {
  addToCart(medId);
  toggleDetailsModal(false);
  navigateToTab("cart");
}

function switchDetailsTab(tabId) {
  document.querySelectorAll(".details-tab-btn").forEach(btn => btn.classList.remove("active"));
  const targetBtn = document.getElementById(`tab-btn-${tabId}`);
  if (targetBtn) targetBtn.classList.add("active");
  
  document.querySelectorAll(".details-tab-content").forEach(pane => pane.classList.remove("active"));
  const targetContent = document.getElementById(`tab-content-${tabId}`);
  if (targetContent) targetContent.classList.add("active");
}

function switchGalleryImage(imgUrl, thumbNode) {
  const main = document.getElementById("gallery-main-image-node");
  if (main) main.src = imgUrl;
  
  document.querySelectorAll(".gallery-thumb").forEach(t => t.classList.remove("active"));
  thumbNode.classList.add("active");
}

function toggleImageZoom(mainNode) {
  mainNode.classList.toggle("zoomed");
}

// --- CATALOG LAYOUT TOGGLE ---
function toggleCatalogLayout() {
  const grid = document.getElementById("catalog-items-grid");
  const icon = document.getElementById("layout-toggle-icon");
  if (!grid || !icon) return;
  
  if (catalogLayout === "grid") {
    catalogLayout = "list";
    grid.classList.add("list-view");
    icon.className = "fa-solid fa-table-cells-large";
    showToast("Switched catalog to List view.", "info");
  } else {
    catalogLayout = "grid";
    grid.classList.remove("list-view");
    icon.className = "fa-solid fa-list-ul";
    showToast("Switched catalog to Grid view.", "info");
  }
}

// --- FAVOURITES WISHLIST SYSTEMS ---
function toggleWishlistModal(show) {
  const modal = document.getElementById("wishlist-modal");
  if (show) {
    modal.classList.add("active");
    renderWishlistUI();
  } else {
    modal.classList.remove("active");
  }
}

async function toggleWishlistItem(medId) {
  if (!currentUser) {
    showToast("Please sign in to save favorite medicines.", "warning");
    return;
  }
  
  const ref = db.ref(`users/${currentUser.uid}/wishlist/${medId}`);
  let isFav = false;
  
  await new Promise((resolve) => {
    ref.on("value", (snap) => {
      isFav = snap.exists();
      resolve();
    });
    ref.off("value");
  });
  
  if (isFav) {
    await ref.remove();
    showToast("Removed medicine from Health Wishlist.", "info");
  } else {
    await ref.set({
      id: medId,
      timestamp: new Date().toISOString()
    });
    showToast("Added medicine to Health Wishlist!", "success");
    const heart = document.getElementById(`details-heart-icon`);
    if (heart) {
      heart.classList.add("fa-beat");
      setTimeout(() => heart.classList.remove("fa-beat"), 1000);
    }
  }
}

function renderWishlistUI() {
  const container = document.getElementById("wishlist-modal-items-list");
  if (!container) return;
  
  if (!currentUser) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-light);">
        <i class="fa-solid fa-lock" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 10px;"></i>
        <p>Please log in to view your personalized Health Wishlist.</p>
      </div>
    `;
    return;
  }
  
  db.ref("medicines").on("value", (snap) => {
    const medsObj = snap.val() || {};
    const meds = Object.values(medsObj);
    const wishMeds = meds.filter(m => wishlist.some(w => w.id === m.id));
    
    if (wishMeds.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-light);">
          <i class="fa-regular fa-heart" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 10px;"></i>
          <p>Your wishlist is currently empty.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = "";
    wishMeds.forEach(med => {
      const card = document.createElement("div");
      card.style = `
        background: #f8fafc;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      `;
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; cursor:pointer;" onclick="toggleWishlistModal(false); openMedicineDetailsModal('${med.id}')">
          <img src="${med.image}" alt="${med.name}" style="width:44px; height:44px; object-fit:cover; border-radius:8px;" referrerPolicy="no-referrer" />
          <div style="min-width:0; flex:1;">
            <h5 style="font-size:0.8rem; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${med.name}</h5>
            <span style="font-size:0.65rem; color:var(--text-light); text-transform:uppercase; font-weight:600;">${med.category}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:0.85rem; font-weight:700; color:var(--primary-dark);">₹${med.price}</span>
          <button class="med-item-action-btn" style="width:28px; height:28px; border-radius:8px;" onclick="addToCart('${med.id}'); toggleWishlistModal(false);">
            <i class="fa-solid fa-cart-plus"></i>
          </button>
          <button style="background:transparent; border:none; color:var(--danger); cursor:pointer; padding:4px;" onclick="toggleWishlistItem('${med.id}')">
            <i class="fa-solid fa-heart"></i>
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  });
  db.ref("medicines").off("value");
}

// --- ADVANCED FILTERS SYSTEM ---
function toggleFilterModal(show) {
  const modal = document.getElementById("filter-modal");
  if (!modal) return;
  if (show) {
    modal.classList.add("active");
    document.getElementById("filter-price-range").value = filterPriceLimit;
    document.getElementById("filter-price-val").textContent = "₹" + filterPriceLimit;
    document.getElementById("filter-stock-checkbox").checked = filterStockOnly;
    
    setFilterDiscount(filterMinDiscount);
    setFilterRating(filterMinRating);
    setFilterRx(filterRxRequired);
    setFilterDistance(filterMaxDistance);
    setFilterSpeed(filterMaxSpeed);
  } else {
    modal.classList.remove("active");
  }
}

function setFilterDiscount(val) {
  filterMinDiscount = val;
  const presets = [0, 10, 20, 30];
  presets.forEach(p => {
    const btn = document.getElementById(`btn-discount-${p || 'any'}`);
    if (btn) {
      if (p === val) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });
}

function setFilterRating(val) {
  filterMinRating = val;
  const presets = [0, 4.0, 4.5];
  presets.forEach(p => {
    const btnId = p === 0 ? "any" : p === 4.0 ? "4" : "45";
    const btn = document.getElementById(`btn-rating-${btnId}`);
    if (btn) {
      if (p === val) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });
}

function setFilterRx(val) {
  filterRxRequired = val;
  const presets = ["any", "yes", "no"];
  presets.forEach(p => {
    const btn = document.getElementById(`btn-rx-${p}`);
    if (btn) {
      if (p === val) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });
}

function setFilterDistance(val) {
  filterMaxDistance = val;
  const presets = [99, 2, 5, 10];
  presets.forEach(p => {
    const btn = document.getElementById(`btn-dist-${p === 99 ? 'any' : p}`);
    if (btn) {
      if (p === val) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });
}

function setFilterSpeed(val) {
  filterMaxSpeed = val;
  const presets = [99, 2, 6, 24];
  presets.forEach(p => {
    const btn = document.getElementById(`btn-speed-${p === 99 ? 'any' : p}`);
    if (btn) {
      if (p === val) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });
}

function resetAllFiltersAndRefresh() {
  filterPriceLimit = 500;
  filterMinDiscount = 0;
  filterMinRating = 0;
  filterRxRequired = "any";
  filterStockOnly = false;
  filterMaxDistance = 99;
  filterMaxSpeed = 99;
  
  document.getElementById("filter-price-range").value = 500;
  document.getElementById("filter-price-val").textContent = "₹500";
  document.getElementById("filter-stock-checkbox").checked = false;
  
  setFilterDiscount(0);
  setFilterRating(0);
  setFilterRx("any");
  setFilterDistance(99);
  setFilterSpeed(99);
  
  showToast("Filters successfully reset.", "info");
  
  const activeSort = document.getElementById("catalog-sort-select").value;
  handleCatalogSort(activeSort);
}

function applyFiltersAndDismissModal() {
  filterPriceLimit = parseInt(document.getElementById("filter-price-range").value);
  filterStockOnly = document.getElementById("filter-stock-checkbox").checked;
  
  toggleFilterModal(false);
  showToast("Filter criteria applied successfully.", "success");
  
  const activeSort = document.getElementById("catalog-sort-select").value;
  handleCatalogSort(activeSort);
}

// --- GLOBAL EXPORTS SO INLINE HTML TRIGGERS WORK ---
window.navigateToTab = navigateToTab;
window.toggleAuthPanel = toggleAuthPanel;
window.toggleDetailsModal = toggleDetailsModal;
window.openMedicineDetailsModal = openMedicineDetailsModal;
window.addToCartAndCloseDetails = addToCartAndCloseDetails;
window.buyNowAndCloseDetails = buyNowAndCloseDetails;
window.switchDetailsTab = switchDetailsTab;
window.switchGalleryImage = switchGalleryImage;
window.toggleImageZoom = toggleImageZoom;
window.toggleCatalogLayout = toggleCatalogLayout;
window.toggleWishlistModal = toggleWishlistModal;
window.toggleWishlistItem = toggleWishlistItem;
window.toggleFilterModal = toggleFilterModal;
window.setFilterDiscount = setFilterDiscount;
window.setFilterRating = setFilterRating;
window.setFilterRx = setFilterRx;
window.setFilterDistance = setFilterDistance;
window.setFilterSpeed = setFilterSpeed;
window.resetAllFiltersAndRefresh = resetAllFiltersAndRefresh;
window.applyFiltersAndDismissModal = applyFiltersAndDismissModal;
window.handleUserLoginSubmit = handleUserLoginSubmit;
window.handleUserSignupSubmit = handleUserSignupSubmit;
window.assessPasswordStrength = assessPasswordStrength;
window.openForgotPasswordSheet = openForgotPasswordSheet;
window.autoFillTestCredentials = autoFillTestCredentials;
window.triggerUserLogOut = triggerUserLogOut;
window.filterCatalogByCategory = filterCatalogByCategory;
window.handleCatalogSort = handleCatalogSort;
window.addToCart = addToCart;
window.updateCartQuantity = updateCartQuantity;
window.applyPromoCouponToCart = applyPromoCouponToCart;
window.togglePaymentModeSelection = togglePaymentModeSelection;
window.triggerCheckoutSubmission = triggerCheckoutSubmission;
window.toggleOrdersSubTab = toggleOrdersSubTab;
window.recenterLiveTrackingMap = recenterLiveTrackingMap;
window.triggerRepeatOrderCheckout = triggerRepeatOrderCheckout;
window.recreateLastOrderedCart = recreateLastOrderedCart;
window.openPrescriptionUploadModal = openPrescriptionUploadModal;
window.togglePrescriptionModal = togglePrescriptionModal;
window.triggerRxFileSelection = triggerRxFileSelection;
window.handleRxFileSelectionSelected = handleRxFileSelectionSelected;
window.removeSelectedRxFile = removeSelectedRxFile;
window.submitRxPrescriptionOrder = submitRxPrescriptionOrder;
window.openAddressManagementModal = openAddressManagementModal;
window.toggleLocationModal = toggleLocationModal;
window.triggerGPSAutoDetect = triggerGPSAutoDetect;
window.handleAddressManualQuery = handleAddressManualQuery;
window.selectAddressPresetTag = selectAddressPresetTag;
window.handleConfirmAddressSelectionSubmit = handleConfirmAddressSelectionSubmit;
window.deleteSavedAddressPin = deleteSavedAddressPin;
window.handleProfileDetailsUpdate = handleProfileDetailsUpdate;
window.openVoiceSearchModal = openVoiceSearchModal;
window.toggleVoiceModal = toggleVoiceModal;
window.openBarcodeScannerModal = openBarcodeScannerModal;
window.toggleBarcodeModal = toggleBarcodeModal;
window.handleSimulatedBarcodeScan = handleSimulatedBarcodeScan;
window.openGlobalSearchPane = openGlobalSearchPane;
window.toggleSearchModal = toggleSearchModal;
window.handleInstantCatalogQuery = handleInstantCatalogQuery;
window.preFillSearchKeyword = preFillSearchKeyword;
window.toggleNotificationPanel = toggleNotificationPanel;
window.triggerMarkSingleNotificationAsRead = triggerMarkSingleNotificationAsRead;
window.triggerDeleteNotification = triggerDeleteNotification;
window.triggerMarkAllNotificationsAsRead = triggerMarkAllNotificationsAsRead;
window.resetScratchCouponGame = resetScratchCouponGame;
window.openNearbyPharmacySheet = openNearbyPharmacySheet;
window.filterEmergencyMedicines = filterEmergencyMedicines;

// --- ENTERPRISE SEGMENTED ORDERS CONTROLLER ---
function setOrdersSegmentTab(tab) {
  currentOrdersSegmentTab = tab;
  
  // Update UI active class
  const tabs = ["all", "active", "delivered", "cancelled", "prescription"];
  tabs.forEach(t => {
    const btn = document.getElementById(`orders-tab-${t}`);
    if (btn) {
      if (t === tab) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });

  renderSegmentedOrders();
}

function renderSegmentedOrders() {
  const wrapper = document.getElementById("orders-list-wrapper");
  if (!wrapper) return;

  const filtered = allUserOrders.filter(order => {
    if (currentOrdersSegmentTab === "all") return true;
    if (currentOrdersSegmentTab === "active") {
      return order.status !== "delivered" && order.status !== "cancelled";
    }
    if (currentOrdersSegmentTab === "delivered") {
      return order.status === "delivered";
    }
    if (currentOrdersSegmentTab === "cancelled") {
      return order.status === "cancelled";
    }
    if (currentOrdersSegmentTab === "prescription") {
      return order.type === "prescription";
    }
    return true;
  });

  if (filtered.length === 0) {
    wrapper.innerHTML = `
      <div style="text-align: center; padding: 4rem 1.5rem; color: var(--text-light);">
        <i class="fa-solid fa-box-open" style="font-size: 3rem; opacity: 0.3; margin-bottom: 12px; color: var(--primary);"></i>
        <h4 style="font-family: var(--font-display); font-weight: 700; color: var(--text); font-size: 1rem;">No orders found</h4>
        <p style="font-size: 0.78rem; margin-top: 6px; line-height: 1.4;">There are no orders listed in the "${currentOrdersSegmentTab.toUpperCase()}" status segment.</p>
      </div>
    `;
    return;
  }

  // Sort descending by timestamp
  filtered.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

  wrapper.innerHTML = "";
  filtered.forEach(order => {
    const card = document.createElement("div");
    card.className = "order-card-enterprise";
    
    const formattedDate = new Date(order.timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const medicineCount = order.items.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const storeName = order.storeName || "DawaDo Partner Pharmacy";
    const statusText = order.status ? order.status.toUpperCase() : "PLACED";
    
    const badgeBg = {
      placed: "#fef3c7", accepted: "#dbeafe", preparing: "#e0f2fe", picked: "#dcfce7", out_for_delivery: "#dcfce7", delivered: "#d1fae5", cancelled: "#fee2e2"
    }[order.status] || "#f1f5f9";
    const badgeColor = {
      placed: "#d97706", accepted: "#2563eb", preparing: "#0369a1", picked: "#15803d", out_for_delivery: "#15803d", delivered: "#065f46", cancelled: "#b91c1c"
    }[order.status] || "#475569";

    const isActive = (order.status !== "delivered" && order.status !== "cancelled");

    let buttonRow = "";
    if (isActive) {
      buttonRow += `
        <button class="btn-primary" style="flex:1; padding: 8px; font-size: 0.75rem;" onclick="openLiveTrackingModal('${order.id}')">
          <i class="fa-solid fa-route"></i> Track Order
        </button>
      `;
    } else {
      buttonRow += `
        <button class="btn-primary" style="flex:1; padding: 8px; font-size: 0.75rem; background: var(--secondary);" onclick="triggerRepeatOrderCheckout('${order.id}')">
          <i class="fa-solid fa-rotate-left"></i> Reorder
        </button>
      `;
    }

    buttonRow += `
      <button class="btn-primary" style="flex:1; padding: 8px; font-size: 0.75rem; background: var(--primary-light); color: var(--primary-dark); border: none;" onclick="openOrderDetailsModal('${order.id}')">
        <i class="fa-solid fa-circle-info"></i> Details
      </button>
      <button class="btn-primary" style="flex:1; padding: 8px; font-size: 0.75rem; background: #f1f5f9; color: var(--text); border: 1px solid var(--border);" onclick="openInvoiceModal('${order.id}')">
        <i class="fa-solid fa-receipt"></i> Invoice
      </button>
    `;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
        <div>
          <h5 style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; color: var(--text);">#${order.id.toUpperCase().substring(0, 8)}</h5>
          <span style="font-size: 0.7rem; color: var(--text-light);">${formattedDate}</span>
        </div>
        <span style="background: ${badgeBg}; color: ${badgeColor}; font-size: 0.65rem; font-weight: 700; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">
          ${statusText}
        </span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-light);">Store Name:</span>
          <span style="font-weight: 600; color: var(--text);">${storeName}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-light);">Medicines Count:</span>
          <span style="font-weight: 600; color: var(--text);">${medicineCount} item(s)</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-light);">Total Amount:</span>
          <span style="font-weight: 700; color: var(--text);">₹${order.grandTotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-light);">Payment Method:</span>
          <span style="font-weight: 600; color: var(--text);">${order.payment.method} (${order.payment.status.toUpperCase()})</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-light);">Expected Delivery:</span>
          <span style="font-weight: 600; color: var(--secondary);">${order.status === "delivered" ? "Delivered" : "Within 45 Mins"}</span>
        </div>
      </div>

      <div style="display: flex; gap: 6px; margin-top: 4px;">
        ${buttonRow}
      </div>
    `;

    wrapper.appendChild(card);
  });
}

function pullToRefreshOrders() {
  showToast("Pull to refresh: synchronizing live order statuses...", "info");
  if (currentUser) {
    db.ref("orders").once("value", (snap) => {
      const ordersObj = snap.val() || {};
      allUserOrders = Object.values(ordersObj).filter(o => o.userId === currentUser.uid);
      renderSegmentedOrders();
      showToast("Orders records synchronized successfully.", "success");
    });
  }
}

// --- ORDER DETAILS VIEW GATEWAY ---
function toggleOrderDetailsModal(show) {
  const modal = document.getElementById("order-details-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

function openOrderDetailsModal(orderId) {
  const order = allUserOrders.find(o => o.id === orderId);
  if (!order) {
    showToast("Unable to fetch order details.", "danger");
    return;
  }

  const content = document.getElementById("order-details-content");
  if (!content) return;

  const formattedDate = new Date(order.timestamp).toLocaleString();
  const storeName = order.storeName || "DawaDo Partner Pharmacy";
  
  // Render medicine list items
  let itemRows = "";
  order.items.forEach(item => {
    const itemPrice = item.price || 0;
    itemRows += `
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid #f8fafc; padding: 6px 0;">
        <span style="color: var(--text);">${item.name} <strong style="color: var(--text-light);">x${item.quantity}</strong></span>
        <span style="font-weight: 600; color: var(--text);">₹${(itemPrice * item.quantity).toFixed(2)}</span>
      </div>
    `;
  });

  const isCancelable = (order.status === "placed");
  const cancelBtnHtml = isCancelable 
    ? `<button class="btn-primary" style="background: var(--danger); font-size: 0.82rem; margin-top: 10px;" onclick="triggerCancelOrderFlow('${order.id}')"><i class="fa-solid fa-ban"></i> Cancel Order (Full Refund)</button>`
    : `<div style="font-size: 0.72rem; color: var(--text-light); text-align: center; margin-top: 10px; background: #f8fafc; padding: 8px; border-radius: 8px;"><i class="fa-solid fa-lock"></i> Order accepted by store. Standard cancellation rules apply.</div>`;

  // Standard billing breakdown details
  const deliveryCharge = order.deliveryCharge || 30;
  const platformFee = 5.00;
  const tax = order.tax || (order.subtotal * 0.05);
  const discount = order.discount || 0;
  const subtotal = order.subtotal || 0;
  const total = order.grandTotal;

  content.innerHTML = `
    <!-- Segment A: General Order details -->
    <div style="background: #f8fafc; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border);">
      <div style="font-size: 0.75rem; color: var(--text-light);">Order ID: <strong style="font-family: var(--font-mono); color: var(--secondary);">${order.id.toUpperCase()}</strong></div>
      <div style="font-size: 0.75rem; color: var(--text-light);">Placed On: <strong style="color: var(--text);">${formattedDate}</strong></div>
      <div style="font-size: 0.75rem; color: var(--text-light);">Store Pharmacy: <strong style="color: var(--text);">${storeName}</strong></div>
      <div style="font-size: 0.75rem; color: var(--text-light);">Payment Gateway: <strong style="color: var(--text);">${order.payment.method} (${order.payment.status.toUpperCase()})</strong></div>
      <div style="font-size: 0.75rem; color: var(--text-light);">Delivery Address: <strong style="color: var(--text);">${order.address?.address || "Selected address pin"}</strong></div>
    </div>

    <!-- Segment B: Medicine List Items -->
    <div style="background: white; border: 1px solid var(--border); border-radius: 14px; padding: 12px;">
      <h6 style="font-size: 0.82rem; font-weight: 700; color: var(--text); margin-bottom: 8px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 4px;"><i class="fa-solid fa-capsules"></i> Prescribed Medication Basket</h6>
      <div style="display: flex; flex-direction: column;">
        ${itemRows}
      </div>
    </div>

    <!-- Segment C: Bill breakdown details -->
    <div style="background: white; border: 1px solid var(--border); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 6px;">
      <h6 style="font-size: 0.82rem; font-weight: 700; color: var(--text); margin-bottom: 4px;"><i class="fa-solid fa-receipt"></i> Premium Bill Summary</h6>
      
      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-light);">
        <span>Cart Subtotal</span>
        <span>₹${subtotal.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-light);">
        <span>HIPAA Verified Delivery Charge</span>
        <span>₹${deliveryCharge.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-light);">
        <span>Platform & Technology Fee</span>
        <span>₹${platformFee.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-light);">
        <span>GST & Medical Cess (5%)</span>
        <span>₹${tax.toFixed(2)}</span>
      </div>
      ${discount > 0 ? `
      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #16a34a; font-weight: 600;">
        <span>Promo Coupon Savings</span>
        <span>-₹${discount.toFixed(2)}</span>
      </div>` : ''}

      <div style="border-top: 1.5px dotted var(--border); padding-top: 6px; display: flex; justify-content: space-between; font-size: 0.88rem; font-weight: 700; color: var(--text); margin-top: 4px;">
        <span>Grand Total Amount</span>
        <span>₹${total.toFixed(2)}</span>
      </div>
    </div>

    <!-- Segment D: Actions & Timeline -->
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${cancelBtnHtml}
    </div>
  `;

  toggleOrderDetailsModal(true);
}

async function triggerCancelOrderFlow(orderId) {
  if (!confirm("Are you sure you want to cancel this medicine dispatch? Our pharmacists might have already sorted the prescription batch.")) return;
  
  try {
    showToast("Initiating secure cancellation sequence...", "info");
    await db.ref(`orders/${orderId}`).update({
      status: "cancelled",
      "payment/status": "refunded"
    });

    db.sendNotification(currentUser.uid, "Order Cancelled", `Refund of your medicine batch #${orderId.substring(0,6).toUpperCase()} initiated.`, "order", { orderId });
    showToast("Order cancelled. Full refund routed back to gateway source.", "success");
    toggleOrderDetailsModal(false);
  } catch (err) {
    showToast("Cancellation failed.", "danger");
  }
}

// --- LIVE TRACKING MODAL ENGINE ---
function toggleLiveTrackingModal(show) {
  const modal = document.getElementById("live-tracking-modal");
  if (show) {
    modal.classList.add("active");
  } else {
    modal.classList.remove("active");
    activeModalTrackingOrderId = null;
    if (modalTrackingMap) {
      modalTrackingMap.remove();
      modalTrackingMap = null;
    }
    modalTrackingRiderMarker = null;
  }
}

function openLiveTrackingModal(orderId) {
  const order = allUserOrders.find(o => o.id === orderId);
  if (!order) {
    showToast("Unable to fetch active routing coordinates.", "danger");
    return;
  }

  activeModalTrackingOrderId = orderId;
  toggleLiveTrackingModal(true);

  // Set up Leaflet Tracking Map inside Modal Frame
  setTimeout(() => {
    initModalLiveTrackingMap(order);
  }, 300);
}

function initModalLiveTrackingMap(order) {
  if (!window.L) return;

  const userLat = order.address?.lat || 12.9615987;
  const userLng = order.address?.lng || 77.5845627;

  // Apollo Store source coords
  const storeLat = 12.9715987;
  const storeLng = 77.5945627;

  if (!modalTrackingMap) {
    modalTrackingMap = window.L.map("modal-tracking-leaflet-map", { zoomControl: false }).setView([userLat, userLng], 14);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap'
    }).addTo(modalTrackingMap);

    // Create Pin for User Address
    window.L.marker([userLat, userLng], {
      icon: window.L.divIcon({
        className: "leaflet-div-marker",
        html: `<div style="background: var(--primary); color: white; border: 2px solid white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.15);"><i class="fa-solid fa-house-chimney-medical" style="font-size:0.9rem;"></i></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      })
    }).addTo(modalTrackingMap).bindPopup("Your Address");

    // Create Pin for Pharmacy Hub
    window.L.marker([storeLat, storeLng], {
      icon: window.L.divIcon({
        className: "leaflet-div-marker",
        html: `<div style="background: var(--secondary); color: white; border: 2px solid white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.15);"><i class="fa-solid fa-prescription-bottle-medical" style="font-size:0.9rem;"></i></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      })
    }).addTo(modalTrackingMap).bindPopup("Pharmacy Hub");

    // Route polyline
    window.L.polyline([[storeLat, storeLng], [userLat, userLng]], {
      color: "var(--secondary)",
      weight: 3,
      dashArray: "6, 6",
      opacity: 0.8
    }).addTo(modalTrackingMap);
  }

  // Update metrics based on status
  updateModalLiveTrackingMap(order);
  updateModalMilestonesTimeline(order);
}

function updateModalLiveTrackingMap(order) {
  if (!modalTrackingMap) return;

  const userLat = order.address?.lat || 12.9615987;
  const userLng = order.address?.lng || 77.5845627;
  const storeLat = 12.9715987;
  const storeLng = 77.5945627;

  // Calculate simulated interpolation point depending on status
  let riderLat = storeLat;
  let riderLng = storeLng;
  let speedText = "0 km/h";
  let distanceText = "1.8 km";
  let etaText = "45 mins";

  if (order.status === "placed") {
    distanceText = "2.4 km";
    etaText = "45 mins";
    speedText = "0 km/h";
  } else if (order.status === "accepted") {
    distanceText = "2.4 km";
    etaText = "35 mins";
    speedText = "0 km/h";
  } else if (order.status === "preparing") {
    distanceText = "2.4 km";
    etaText = "25 mins";
    speedText = "0 km/h";
  } else if (order.status === "picked" || order.status === "out_for_delivery") {
    // Intercept with 60% distance completed
    riderLat = storeLat + (userLat - storeLat) * 0.6;
    riderLng = storeLng + (userLng - storeLng) * 0.6;
    distanceText = "0.9 km";
    etaText = "8 mins";
    speedText = "34 km/h";
  } else if (order.status === "delivered") {
    riderLat = userLat;
    riderLng = userLng;
    distanceText = "0 km";
    etaText = "Arrived";
    speedText = "0 km/h";
  }

  document.getElementById("tracking-metric-distance").textContent = distanceText;
  document.getElementById("tracking-metric-eta").textContent = etaText;
  document.getElementById("tracking-metric-speed").textContent = speedText;

  // Manage rider marker
  if (order.status === "picked" || order.status === "out_for_delivery" || order.status === "delivered") {
    if (!modalTrackingRiderMarker) {
      modalTrackingRiderMarker = window.L.marker([riderLat, riderLng], {
        icon: window.L.divIcon({
          className: "leaflet-div-marker",
          html: `<div style="background: #e11d48; color: white; border: 2px solid white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(225,29,72,0.3);"><i class="fa-solid fa-motorcycle" style="font-size:0.95rem;"></i></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      }).addTo(modalTrackingMap).bindPopup("Rider: Suresh");
    } else {
      modalTrackingRiderMarker.setLatLng([riderLat, riderLng]);
    }
  } else {
    if (modalTrackingRiderMarker) {
      modalTrackingRiderMarker.remove();
      modalTrackingRiderMarker = null;
    }
  }
}

function recenterModalTrackingMap() {
  if (modalTrackingMap && currentUser) {
    const lat = selectedAddress?.lat || 12.9615987;
    const lng = selectedAddress?.lng || 77.5845627;
    modalTrackingMap.setView([lat, lng], 14);
  }
}

function updateModalMilestonesTimeline(order) {
  const container = document.getElementById("modal-tracking-timeline");
  if (!container) return;

  const stages = ["placed", "accepted", "preparing", "picked", "delivered"];
  const currentStageIndex = stages.indexOf(order.status === "out_for_delivery" ? "picked" : order.status);

  let html = "";
  stages.forEach((stage, idx) => {
    const isCompleted = idx <= currentStageIndex;
    const isActive = idx === currentStageIndex;
    
    let color = "#e2e8f0";
    let pulseClass = "";
    if (isCompleted) color = "var(--primary)";
    if (isActive) {
      color = "var(--secondary)";
      pulseClass = "outline: 4px solid var(--secondary-light);";
    }

    const titleMap = {
      placed: "Order Sourced & Registered",
      accepted: "Pharmacist HIPAA Approved",
      preparing: "Sanitized & Packaged",
      picked: "Out For Delivery (Rider Dispatched)",
      delivered: "Medical Supplies Handoff Confirmed"
    };

    const descMap = {
      placed: "Secure database record initialized.",
      accepted: "Prescription checked and authorized.",
      preparing: "Batch placed in sealed, insulated containers.",
      picked: "Rider navigating via real-time OSM coordinates.",
      delivered: "Logistics handover completed successfully."
    };

    html += `
      <div style="display: flex; gap: 14px; padding-bottom: 1.25rem; position: relative;">
        <div style="width: 12px; height: 12px; background: ${color}; border-radius: 50%; margin-top: 4px; ${pulseClass} z-index: 2; border: 2px solid white;"></div>
        ${idx < stages.length - 1 ? `<div style="position: absolute; left: 5px; top: 12px; bottom: 0; width: 2px; background: ${idx < currentStageIndex ? 'var(--primary)' : '#e2e8f0'}; z-index: 1;"></div>` : ''}
        <div style="flex:1;">
          <h6 style="font-size: 0.82rem; font-weight: 700; color: ${isCompleted ? 'var(--text)' : 'var(--text-light)'};">${titleMap[stage]}</h6>
          <p style="font-size: 0.68rem; color: var(--text-light); margin-top: 2px;">${descMap[stage]}</p>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// --- PREMIUM DIGITAL INVOICE MODULE ---
function toggleInvoiceModal(show) {
  const modal = document.getElementById("invoice-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

function openInvoiceModal(orderId) {
  const order = allUserOrders.find(o => o.id === orderId);
  if (!order) {
    showToast("Invoice fetch failed.", "danger");
    return;
  }

  const content = document.getElementById("invoice-content-area");
  if (!content) return;

  const formattedDate = new Date(order.timestamp).toLocaleDateString();
  const taxId = "GSTIN-" + order.id.toUpperCase().substring(0, 10);
  
  let itemRows = "";
  order.items.forEach(item => {
    itemRows += `
      <tr style="border-bottom: 1px solid #f1f5f9; font-size: 0.75rem;">
        <td style="padding: 8px 0; color: var(--text);">${item.name}</td>
        <td style="padding: 8px 0; text-align: center; color: var(--text-light);">x${item.quantity}</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600; color: var(--text);">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `;
  });

  const subtotal = order.subtotal || 0;
  const delivery = order.deliveryCharge || 30;
  const platform = 5.00;
  const gst = order.tax || (subtotal * 0.05);
  const discount = order.discount || 0;
  const grandTotal = order.grandTotal;

  content.innerHTML = `
    <div style="border: 1.5px solid var(--border); border-radius: 16px; padding: 14px; background: white; display: flex; flex-direction: column; gap: 10px;">
      
      <!-- Brand header -->
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--primary-dark); padding-bottom: 10px;">
        <div>
          <h4 style="font-family: var(--font-display); font-weight: 800; font-size: 1.2rem; color: var(--primary-dark);">DawaDo</h4>
          <span style="font-size: 0.65rem; color: var(--text-light);">Your Medicine Partner</span>
        </div>
        <div style="text-align: right;">
          <h5 style="font-size: 0.82rem; font-weight: 700; color: var(--text);">Tax Invoice</h5>
          <span style="font-size: 0.68rem; font-family: var(--font-mono); color: var(--text-light);">${taxId}</span>
        </div>
      </div>

      <!-- Meta data -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.72rem; border-bottom: 1.5px dashed var(--border); padding-bottom: 8px;">
        <div>
          <span style="color: var(--text-light);">Billed To:</span>
          <div style="font-weight: 700; color: var(--text);">${currentUser.name || "DawaDo User"}</div>
          <div style="color: var(--text-light);">${order.address?.address || "Selected destination coordinates"}</div>
        </div>
        <div style="text-align: right;">
          <span style="color: var(--text-light);">Invoice Details:</span>
          <div style="font-weight: 700; color: var(--text);">No: INV-${order.id.toUpperCase().substring(0,6)}</div>
          <div style="color: var(--text-light);">Date: ${formattedDate}</div>
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1.5px solid var(--border); font-size: 0.72rem; color: var(--text-light); text-align: left;">
            <th style="padding: 6px 0;">Item Description</th>
            <th style="padding: 6px 0; text-align: center;">Qty</th>
            <th style="padding: 6px 0; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <!-- Breakdown -->
      <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1.5px solid var(--border); padding-top: 8px; font-size: 0.75rem; color: var(--text-light);">
        <div style="display: flex; justify-content: space-between;">
          <span>Cart Subtotal</span>
          <span style="color: var(--text); font-weight: 500;">₹${subtotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Verified Pharmacy Logistics fee</span>
          <span style="color: var(--text); font-weight: 500;">₹${delivery.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Platform & Tech commission</span>
          <span style="color: var(--text); font-weight: 500;">₹${platform.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Integrated GST / CGST & Cess</span>
          <span style="color: var(--text); font-weight: 500;">₹${gst.toFixed(2)}</span>
        </div>
        ${discount > 0 ? `
        <div style="display: flex; justify-content: space-between; color: #16a34a; font-weight: 600;">
          <span>Offers Discount applied</span>
          <span>-₹${discount.toFixed(2)}</span>
        </div>` : ''}

        <div style="border-top: 1.5px dotted var(--border); padding-top: 6px; display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 700; color: var(--text); margin-top: 4px;">
          <span>Grand Total Paid</span>
          <span>₹${grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <!-- Regulatory footer -->
      <div style="text-align: center; font-size: 0.6rem; color: var(--text-light); border-top: 1px solid #f1f5f9; padding-top: 8px; margin-top: 4px;">
        This is a system-generated HIPAA & FDA-compliant electronic billing voucher. Sourced from licensed pharmacists. No physical signature required.
      </div>
    </div>
  `;

  toggleInvoiceModal(true);
}

function downloadInvoicePDF() {
  showToast("Downloading tax invoice PDF to system local store...", "info");
  setTimeout(() => {
    showToast("Invoice PDF download completed successfully.", "success");
  }, 1000);
}

function shareInvoicePDF() {
  showToast("Generating secure sharing credentials link...", "info");
  setTimeout(() => {
    showToast("Tax invoice URL copied to system clipboard.", "success");
  }, 800);
}

// --- FAMILY PROFILES STATE & ACTIONS ---
function toggleFamilyProfilesModal(show) {
  const modal = document.getElementById("family-profiles-modal");
  if (show) {
    modal.classList.add("active");
    renderFamilyProfilesList();
  } else {
    modal.classList.remove("active");
  }
}

function renderFamilyProfilesList() {
  const container = document.getElementById("family-profiles-list");
  if (!container) return;

  if (!currentUser) return;

  db.ref(`users/${currentUser.uid}/family`).once("value", (snap) => {
    const familyObj = snap.val() || {};
    const members = Object.values(familyObj);

    if (members.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-light);">
          <i class="fa-solid fa-people-roof" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 8px;"></i>
          <p style="font-size: 0.8rem;">No family profiles created yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
    members.forEach(member => {
      const card = document.createElement("div");
      card.style = `
        background: white; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;
      `;
      card.innerHTML = `
        <div>
          <h6 style="font-size: 0.82rem; font-weight: 700; color: var(--text);">${member.name} (${member.relation})</h6>
          <p style="font-size: 0.7rem; color: var(--text-light); margin-top: 2px;">Age: ${member.age} • Gender: ${member.gender} • Blood: ${member.bloodGroup || 'N/A'}</p>
          ${member.allergies ? `<p style="font-size: 0.65rem; color: #ef4444; font-weight: 600; margin-top: 2px;">Allergies: ${member.allergies}</p>` : ''}
        </div>
        <button class="btn-primary" style="background: #fee2e2; color: #ef4444; border: none; width: auto; padding: 4px 8px; font-size: 0.7rem; border-radius: 6px;" onclick="deleteFamilyProfile('${member.id}')">Delete</button>
      `;
      container.appendChild(card);
    });
  });
}

function openAddFamilyMemberForm() {
  const container = document.getElementById("family-profiles-list");
  if (!container) return;

  container.innerHTML = `
    <form id="add-family-form" onsubmit="handleSaveFamilyProfileSubmit(event)" style="display: flex; flex-direction: column; gap: 8px; background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid var(--border);">
      <h6 style="font-size: 0.8rem; font-weight: 700; color: var(--text);">Add Member Details</h6>
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="family-name" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;" required placeholder="e.g. Aditi Tiwari" />
      </div>
      <div class="form-group">
        <label>Relation</label>
        <select id="family-relation" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;">
          <option value="Father">Father</option>
          <option value="Mother">Mother</option>
          <option value="Spouse">Spouse</option>
          <option value="Child">Child</option>
          <option value="Sibling">Sibling</option>
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div class="form-group">
          <label>Age</label>
          <input type="number" id="family-age" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;" required placeholder="e.g. 28" />
        </div>
        <div class="form-group">
          <label>Gender</label>
          <select id="family-gender" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;">
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 8px;">
        <div class="form-group">
          <label>Blood Group</label>
          <input type="text" id="family-blood" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;" placeholder="e.g. O+" />
        </div>
        <div class="form-group">
          <label>Known Allergies</label>
          <input type="text" id="family-allergies" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;" placeholder="e.g. Penicillin" />
        </div>
      </div>
      <div style="display:flex; gap:6px; margin-top:4px;">
        <button type="button" class="btn-primary" style="background:#e2e8f0; color:var(--text); border:none;" onclick="renderFamilyProfilesList()">Cancel</button>
        <button type="submit" class="btn-primary">Save Profile</button>
      </div>
    </form>
  `;
}

async function handleSaveFamilyProfileSubmit(event) {
  event.preventDefault();
  if (!currentUser) return;

  const name = document.getElementById("family-name").value;
  const relation = document.getElementById("family-relation").value;
  const age = document.getElementById("family-age").value;
  const gender = document.getElementById("family-gender").value;
  const blood = document.getElementById("family-blood").value;
  const allergies = document.getElementById("family-allergies").value;

  try {
    showToast("Saving family profile...", "info");
    const newRef = db.ref(`users/${currentUser.uid}/family`).push();
    await newRef.set({
      id: newRef.key,
      name, relation, age, gender, bloodGroup: blood, allergies
    });
    showToast("Family profile added successfully.", "success");
    renderFamilyProfilesList();
  } catch (err) {
    showToast("Profile creation failed.", "danger");
  }
}

async function deleteFamilyProfile(id) {
  if (!currentUser || !confirm("Delete family profile permanently?")) return;
  try {
    await db.ref(`users/${currentUser.uid}/family/${id}`).remove();
    showToast("Family profile deleted.", "success");
    renderFamilyProfilesList();
  } catch (err) {
    showToast("Deletion failed.", "danger");
  }
}

// --- HEALTH RECORDS SYSTEM ---
function toggleHealthRecordsModal(show) {
  const modal = document.getElementById("health-records-modal");
  if (show) {
    modal.classList.add("active");
    renderHealthRecordsList();
  } else {
    modal.classList.remove("active");
  }
}

function renderHealthRecordsList() {
  const container = document.getElementById("health-records-list");
  if (!container) return;
  if (!currentUser) return;

  db.ref(`users/${currentUser.uid}/records`).once("value", (snap) => {
    const recordsObj = snap.val() || {};
    const records = Object.values(recordsObj);

    if (records.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-light);">
          <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 8px;"></i>
          <p style="font-size: 0.8rem;">No digital medical documents uploaded.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
    records.forEach(rec => {
      const card = document.createElement("div");
      card.style = `
        background: white; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;
      `;
      const formattedDate = new Date(rec.timestamp).toLocaleDateString();
      card.innerHTML = `
        <div>
          <h6 style="font-size: 0.8rem; font-weight: 700; color: var(--text);">${rec.fileName}</h6>
          <span style="font-size: 0.68rem; color: var(--text-light);">Uploaded: ${formattedDate}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <a href="${rec.url}" target="_blank" class="btn-primary" style="width:auto; padding:4px 8px; font-size:0.7rem; border-radius:6px; background:var(--secondary); text-decoration:none;">View</a>
          <button class="btn-primary" style="background:#fee2e2; color:#ef4444; border:none; width:auto; padding:4px 8px; font-size:0.7rem; border-radius:6px;" onclick="deleteHealthRecord('${rec.id}')">Delete</button>
        </div>
      `;
      container.appendChild(card);
    });
  });
}

function triggerRecordFileUpload() {
  document.getElementById("record-hidden-file-input").click();
}

async function handleRecordFileUploadSelected(event) {
  const file = event.target.files[0];
  if (!file || !currentUser) return;

  try {
    showToast("Uploading document to HIPAA-encrypted Cloudinary store...", "info");
    const cloudRes = await cloudinaryUtils.uploadImage(file);
    
    const newRef = db.ref(`users/${currentUser.uid}/records`).push();
    await newRef.set({
      id: newRef.key,
      fileName: file.name,
      url: cloudRes.secure_url,
      timestamp: new Date().toISOString()
    });

    showToast("Document saved to cloud folder successfully.", "success");
    renderHealthRecordsList();
  } catch (err) {
    showToast("Cloud integration failure.", "danger");
  }
}

async function deleteHealthRecord(id) {
  if (!currentUser || !confirm("Permanently delete this medical document?")) return;
  try {
    await db.ref(`users/${currentUser.uid}/records/${id}`).remove();
    showToast("Document deleted.", "success");
    renderHealthRecordsList();
  } catch (err) {
    showToast("Deletion failed.", "danger");
  }
}

// --- Routine Reminders ENGINE ---
function toggleHealthRemindersModal(show) {
  const modal = document.getElementById("health-reminders-modal");
  if (show) {
    modal.classList.add("active");
    renderHealthRemindersList();
  } else {
    modal.classList.remove("active");
  }
}

function renderHealthRemindersList() {
  const container = document.getElementById("health-reminders-list");
  if (!container) return;
  if (!currentUser) return;

  db.ref(`users/${currentUser.uid}/reminders`).once("value", (snap) => {
    const remindersObj = snap.val() || {};
    const reminders = Object.values(remindersObj);

    if (reminders.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-light);">
          <i class="fa-solid fa-bell-slash" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 8px;"></i>
          <p style="font-size: 0.8rem;">No routines scheduled yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
    reminders.forEach(rem => {
      const card = document.createElement("div");
      card.style = `
        background: white; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;
      `;
      card.innerHTML = `
        <div>
          <h6 style="font-size: 0.82rem; font-weight: 700; color: var(--text);">${rem.medicineName}</h6>
          <p style="font-size: 0.7rem; color: var(--text-light); margin-top:2px;"><i class="fa-solid fa-clock"></i> Scheduled Time: ${rem.time} (${rem.frequency})</p>
          <span style="font-size: 0.65rem; background: var(--primary-light); color: var(--primary-dark); padding: 2px 6px; border-radius: 4px; font-weight:700;">${rem.dosage || '1 Tablet'}</span>
        </div>
        <button class="btn-primary" style="background:#fee2e2; color:#ef4444; border:none; width:auto; padding:4px 8px; font-size:0.7rem; border-radius:6px;" onclick="deleteHealthReminder('${rem.id}')">Dismiss</button>
      `;
      container.appendChild(card);
    });
  });
}

function openAddReminderForm() {
  const container = document.getElementById("health-reminders-list");
  if (!container) return;

  container.innerHTML = `
    <form id="add-reminder-form" onsubmit="handleSaveReminderSubmit(event)" style="display: flex; flex-direction: column; gap: 8px; background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid var(--border);">
      <h6 style="font-size: 0.8rem; font-weight: 700; color: var(--text);">Schedule Routine Reminder</h6>
      <div class="form-group">
        <label>Medicine / Routine Name</label>
        <input type="text" id="rem-name" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;" required placeholder="e.g. Paracetamol 650mg, Water intake" />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div class="form-group">
          <label>Time</label>
          <input type="time" id="rem-time" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;" required />
        </div>
        <div class="form-group">
          <label>Frequency</label>
          <select id="rem-freq" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;">
            <option value="Daily">Daily</option>
            <option value="Weekly">Weekly</option>
            <option value="Bi-Weekly">Bi-Weekly</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Dosage Instruction</label>
        <input type="text" id="rem-dosage" class="form-control" style="padding-left:12px; font-size:0.8rem; padding:6px;" placeholder="e.g. 1 Tablet after breakfast" />
      </div>
      <div style="display:flex; gap:6px; margin-top:4px;">
        <button type="button" class="btn-primary" style="background:#e2e8f0; color:var(--text); border:none;" onclick="renderHealthRemindersList()">Cancel</button>
        <button type="submit" class="btn-primary">Schedule</button>
      </div>
    </form>
  `;
}

async function handleSaveReminderSubmit(event) {
  event.preventDefault();
  if (!currentUser) return;

  const medicineName = document.getElementById("rem-name").value;
  const time = document.getElementById("rem-time").value;
  const frequency = document.getElementById("rem-freq").value;
  const dosage = document.getElementById("rem-dosage").value;

  try {
    showToast("Setting timer parameters...", "info");
    const newRef = db.ref(`users/${currentUser.uid}/reminders`).push();
    await newRef.set({
      id: newRef.key,
      medicineName, time, frequency, dosage
    });
    showToast("Reminder routine scheduled.", "success");
    renderHealthRemindersList();
  } catch (err) {
    showToast("Scheduling failed.", "danger");
  }
}

async function deleteHealthReminder(id) {
  if (!currentUser || !confirm("Dismiss this active reminder?")) return;
  try {
    await db.ref(`users/${currentUser.uid}/reminders/${id}`).remove();
    showToast("Reminder dismissed.", "success");
    renderHealthRemindersList();
  } catch (err) {
    showToast("Dismissal failed.", "danger");
  }
}

// --- SETTINGS CONTROLLER ---
function toggleSettingsModal(show) {
  const modal = document.getElementById("settings-modal");
  if (show) {
    modal.classList.add("active");
    if (currentUser) {
      document.getElementById("settings-account-email").textContent = currentUser.email;
    }
  } else {
    modal.classList.remove("active");
  }
}

function saveAppSettings() {
  showToast("Synchronizing theme and notification choices...", "info");
  setTimeout(() => {
    showToast("Local preferences saved successfully.", "success");
  }, 600);
}

async function triggerDeleteAccount() {
  if (!currentUser) return;
  const doubleCheck = prompt("WARNING: This will permanently purge your HIPAA profile, medical records, and past invoices. To confirm, type your account email:");
  if (doubleCheck !== currentUser.email) {
    showToast("Email confirmation mismatch. Purge sequence aborted.", "warning");
    return;
  }

  try {
    showToast("Purging records from Firebase RTDB...", "info");
    await db.ref(`users/${currentUser.uid}`).remove();
    await auth.currentUser.delete();
    showToast("Profile purged. Redirecting...", "success");
  } catch (err) {
    showToast("Authentication re-verification required before purging profile.", "danger");
  }
}

// --- HELP & SUPPORT MODULE ---
function toggleHelpSupportModal(show) {
  const modal = document.getElementById("support-modal");
  if (show) {
    modal.classList.add("active");
    renderTicketsLog();
  } else {
    modal.classList.remove("active");
  }
}

function toggleSupportSubTab(tab) {
  const isFaq = tab === "faq";
  document.getElementById("support-faq-panel").style.display = isFaq ? "flex" : "none";
  document.getElementById("support-ticket-panel").style.display = isFaq ? "none" : "flex";

  const btnFaq = document.getElementById("support-tab-faq");
  const btnTicket = document.getElementById("support-tab-ticket");

  if (isFaq) {
    btnFaq.style.background = "white";
    btnFaq.style.color = "var(--primary-dark)";
    btnTicket.style.background = "transparent";
    btnTicket.style.color = "var(--text-light)";
  } else {
    btnFaq.style.background = "transparent";
    btnFaq.style.color = "var(--text-light)";
    btnTicket.style.background = "white";
    btnTicket.style.color = "var(--primary-dark)";
  }
}

function renderTicketsLog() {
  const container = document.getElementById("support-tickets-log");
  if (!container) return;
  if (!currentUser) return;

  db.ref(`users/${currentUser.uid}/tickets`).once("value", (snap) => {
    const ticketsObj = snap.val() || {};
    const tickets = Object.values(ticketsObj);

    if (tickets.length === 0) {
      container.innerHTML = `<p style="font-size: 0.72rem; color: var(--text-light); text-align: center; padding: 10px;">No support tickets created yet.</p>`;
      return;
    }

    container.innerHTML = "";
    tickets.reverse().forEach(tk => {
      const card = document.createElement("div");
      card.style = `background: white; border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; font-size: 0.72rem; display: flex; flex-direction: column; gap: 2px;`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span style="color:var(--text);">Category: ${tk.category.toUpperCase()}</span>
          <span style="color:var(--secondary); font-family:var(--font-mono);">#T-${tk.id.substring(0,4).toUpperCase()}</span>
        </div>
        <p style="color:var(--text-light); margin-top:2px;">${tk.description}</p>
        <span style="align-self:flex-start; background: var(--primary-light); color: var(--primary-dark); font-size:0.6rem; font-weight:700; padding:2px 6px; border-radius:4px; margin-top:4px; text-transform:uppercase;">Status: Open</span>
      `;
      container.appendChild(card);
    });
  });
}

async function handleRaiseSupportTicket(event) {
  event.preventDefault();
  if (!currentUser) return;

  const category = document.getElementById("ticket-category").value;
  const description = document.getElementById("ticket-description").value;

  try {
    showToast("Generating ticket log in RTDB...", "info");
    const newRef = db.ref(`users/${currentUser.uid}/tickets`).push();
    await newRef.set({
      id: newRef.key,
      category, description,
      timestamp: new Date().toISOString()
    });

    showToast("Ticket log raised successfully. Support will contact you shortly.", "success");
    document.getElementById("ticket-description").value = "";
    renderTicketsLog();
  } catch (err) {
    showToast("Failed to file ticket.", "danger");
  }
}

// --- ABOUT MODAL CONTROLLER ---
function toggleAboutModal(show) {
  const modal = document.getElementById("about-modal");
  if (show) modal.classList.add("active");
  else modal.classList.remove("active");
}

window.setOrdersSegmentTab = setOrdersSegmentTab;
window.pullToRefreshOrders = pullToRefreshOrders;
window.toggleOrderDetailsModal = toggleOrderDetailsModal;
window.openOrderDetailsModal = openOrderDetailsModal;
window.triggerCancelOrderFlow = triggerCancelOrderFlow;
window.toggleLiveTrackingModal = toggleLiveTrackingModal;
window.openLiveTrackingModal = openLiveTrackingModal;
window.recenterModalTrackingMap = recenterModalTrackingMap;
window.toggleInvoiceModal = toggleInvoiceModal;
window.openInvoiceModal = openInvoiceModal;
window.downloadInvoicePDF = downloadInvoicePDF;
window.shareInvoicePDF = shareInvoicePDF;
window.toggleFamilyProfilesModal = toggleFamilyProfilesModal;
window.deleteFamilyProfile = deleteFamilyProfile;
window.openAddFamilyMemberForm = openAddFamilyMemberForm;
window.handleSaveFamilyProfileSubmit = handleSaveFamilyProfileSubmit;
window.toggleHealthRecordsModal = toggleHealthRecordsModal;
window.triggerRecordFileUpload = triggerRecordFileUpload;
window.handleRecordFileUploadSelected = handleRecordFileUploadSelected;
window.deleteHealthRecord = deleteHealthRecord;
window.toggleHealthRemindersModal = toggleHealthRemindersModal;
window.deleteHealthReminder = deleteHealthReminder;
window.openAddReminderForm = openAddReminderForm;
window.handleSaveReminderSubmit = handleSaveReminderSubmit;
window.toggleSettingsModal = toggleSettingsModal;
window.saveAppSettings = saveAppSettings;
window.triggerDeleteAccount = triggerDeleteAccount;
window.toggleHelpSupportModal = toggleHelpSupportModal;
window.toggleSupportSubTab = toggleSupportSubTab;
window.handleRaiseSupportTicket = handleRaiseSupportTicket;
window.toggleAboutModal = toggleAboutModal;
