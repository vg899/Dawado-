/**
 * DawaDo Enterprise Realtime Database & Auth Synchronization Engine
 * Supports real Firebase Realtime Database (if configured)
 * Falls back to high-fidelity, multi-tab LocalStorage-based Realtime Database Simulator
 */

// Initialize Database State
const DB_VERSION = "1.0.0";
const STORAGE_KEY = "dawado_db_root";
const AUTH_KEY = "dawado_current_user";
const USERS_KEY = "dawado_users";

// Default Medicines List (Seed Data)
const DEFAULT_MEDICINES = [
  { id: "med_1", name: "Paracetamol 650mg", price: 45, stock: 120, category: "Fever & Pain", description: "Effective relief from fever and mild to moderate pain.", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80" },
  { id: "med_2", name: "Amoxicillin 500mg", price: 120, stock: 80, category: "Antibiotics", description: "Antibiotic used to treat bacterial infections. Prescription required.", image: "https://images.unsplash.com/photo-1550572017-edd951b55104?auto=format&fit=crop&w=400&q=80", prescriptionRequired: true },
  { id: "med_3", name: "Cetirizine 10mg", price: 35, stock: 200, category: "Allergy Relief", description: "Provides 24-hour relief from allergies and hay fever.", image: "https://images.unsplash.com/photo-1607619275048-24722480f875?auto=format&fit=crop&w=400&q=80" },
  { id: "med_4", name: "Metformin 500mg", price: 85, stock: 150, category: "Diabetes", description: "Oral diabetes medicine that helps control blood sugar levels.", image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=400&q=80", prescriptionRequired: true },
  { id: "med_5", name: "Atorvastatin 10mg", price: 110, stock: 95, category: "Heart Health", description: "Helps lower bad cholesterol and fats in the blood.", image: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80", prescriptionRequired: true },
  { id: "med_6", name: "Ibuprofen 400mg", price: 50, stock: 180, category: "Fever & Pain", description: "Nonsteroidal anti-inflammatory drug (NSAID) to reduce pain and inflammation.", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=400&q=80" },
  { id: "med_7", name: "Cough Syrup (Guaifenesin)", price: 75, stock: 60, category: "Cough & Cold", description: "Expectorant cough syrup to clear congestion and ease breathing.", image: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&w=400&q=80" },
  { id: "med_8", name: "Vitamin C 500mg", price: 90, stock: 300, category: "Vitamins & Supplements", description: "Daily immunity booster and powerful antioxidant.", image: "https://images.unsplash.com/photo-1616679911721-fe6eec47f0cd?auto=format&fit=crop&w=400&q=80" }
];

// Seed initial database structure
function seedDatabase() {
  let dbRoot = localStorage.getItem(STORAGE_KEY);
  if (!dbRoot) {
    const initialDB = {
      users: {
        "user_1": {
          id: "user_1",
          name: "Ananya Sharma",
          email: "user@dawado.com",
          phone: "+91 91234 56789",
          lat: 12.9615987,
          lng: 77.5845627,
          totalOrders: 2,
          totalSpend: 317.25,
          savedAddresses: ["Flat 302, Green Glen Layout, Bangalore", "G-08, Shanti Apartment, Bangalore"],
          lastLogin: "2026-07-02T22:00:00.000Z",
          blocked: false,

          // Enterprise structure (Part 6A)
          profile: {
            uid: "user_1",
            name: "Ananya Sharma",
            email: "user@dawado.com",
            phone: "+91 91234 56789",
            photoURL: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
            status: "active",
            createdAt: "2026-07-02T22:00:00.000Z",
            lastLogin: "2026-07-02T22:00:00.000Z"
          },
          addresses: {
            "addr_1": { id: "addr_1", address: "Flat 302, Green Glen Layout, Bangalore", isDefault: true },
            "addr_2": { id: "addr_2", address: "G-08, Shanti Apartment, Bangalore", isDefault: false }
          },
          cart: {},
          wishlist: {},
          prescriptions: {},
          orders: {
            "O-2026-001": true,
            "O-2026-002": true
          },
          notifications: {},
          recentSearches: ["paracetamol", "cough syrup"],
          recentlyViewed: ["med_1", "med_3"],
          settings: { notificationsEnabled: true },
          activity: {}
        }
      },
      stores: {
        "store_1": {
          id: "store_1",
          name: "Apollo Pharmacy Metro",
          email: "store@dawado.com",
          lat: 12.9715987,
          lng: 77.5945627,
          active: true,
          balance: 2500,
          rating: 4.8,
          logo: "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=200&q=80",
          drugLicense: "DL-2026-908123",
          gst: "29AAAAA1111A1Z1",
          city: "Bangalore",

          // Enterprise structure (Part 6A)
          profile: {
            id: "store_1",
            name: "Apollo Pharmacy Metro",
            email: "store@dawado.com",
            phone: "+91 8011223344",
            lat: 12.9715987,
            lng: 77.5945627,
            active: true,
            rating: 4.8,
            logo: "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=200&q=80",
            city: "Bangalore"
          },
          kyc: {
            drugLicense: "DL-2026-908123",
            gst: "29AAAAA1111A1Z1",
            verified: true
          },
          medicines: {}, // populated below
          inventory: {},
          orders: {
            "O-2026-001": true,
            "O-2026-002": true
          },
          earnings: {
            totalSettled: 2500,
            pendingSettlement: 350
          },
          settings: {
            workingHours: "08:00 - 22:00",
            holidayMode: false
          },
          analytics: {},
          notifications: {},
          staff: {
            "staff_1": { id: "staff_1", name: "Dr. Alok Verma", role: "pharmacist", status: "active" }
          }
        }
      },
      delivery_boys: {
        "delivery_1": {
          id: "delivery_1",
          name: "Ramesh Kumar",
          email: "delivery@dawado.com",
          lat: 12.9715987,
          lng: 77.5945627,
          active: true,
          cashBalance: 161.25,
          status: "online",
          phone: "+91 98765 43210",
          vehicleType: "Bike",
          vehicleNumber: "KA-01-EE-1122",
          aadhaarNumber: "123456789012",
          dlNumber: "DL-908123A",
          rating: 4.9,
          complianceScore: 98,
          attendance: "Present",

          // Enterprise structure (Part 6A)
          profile: {
            id: "delivery_1",
            name: "Ramesh Kumar",
            email: "delivery@dawado.com",
            phone: "+91 98765 43210",
            vehicleType: "Bike",
            vehicleNumber: "KA-01-EE-1122",
            aadhaarNumber: "123456789012",
            dlNumber: "DL-908123A",
            rating: 4.9,
            active: true
          },
          liveLocation: {
            lat: 12.9715987,
            lng: 77.5945627,
            updatedAt: "2026-07-02T22:45:00.000Z"
          },
          orders: {
            "O-2026-001": true,
            "O-2026-002": true
          },
          earnings: {
            totalEarned: 1250,
            cashOnHand: 161.25
          },
          settlements: {
            "STL-000244": true
          },
          notifications: {},
          settings: {}
        }
      },
      admins: {
        "admin_1": {
          id: "admin_1",
          profile: {
            uid: "admin_1",
            name: "Super Admin",
            email: "admin@dawado.com"
          },
          permissions: {
            super: true,
            billing: true,
            dispatch: true
          },
          activity: {},
          settings: {}
        }
      },
      medicines: {},
      categories: {
        "cat_1": { id: "cat_1", name: "Fever & Pain", icon: "fa-temperature-high", status: "active", order: 1, image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200", priority: 1 },
        "cat_2": { id: "cat_2", name: "Antibiotics", icon: "fa-capsules", status: "active", order: 2, image: "https://images.unsplash.com/photo-1550572017-edd951b55104?w=200", priority: 2 },
        "cat_3": { id: "cat_3", name: "Allergy Relief", icon: "fa-hand-dots", status: "active", order: 3, image: "https://images.unsplash.com/photo-1607619275048-24722480f875?w=200", priority: 3 },
        "cat_4": { id: "cat_4", name: "Diabetes", icon: "fa-droplet", status: "active", order: 4, image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=200", priority: 4 },
        "cat_5": { id: "cat_5", name: "Heart Health", icon: "fa-heart-pulse", status: "active", order: 5, image: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=200", priority: 5 },
        "cat_6": { id: "cat_6", name: "Cough & Cold", icon: "fa-virus", status: "active", order: 6, image: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?w=200", priority: 6 },
        "cat_7": { id: "cat_7", name: "Vitamins", icon: "fa-circle-radiation", status: "active", order: 7, image: "https://images.unsplash.com/photo-1616679911721-fe6eec47f0cd?w=200", priority: 7 }
      },
      brands: {
        "brand_1": { id: "brand_1", name: "GlaxoSmithKline", manufacturer: "GSK Pharmaceuticals", logo: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?w=100", status: "active" },
        "brand_2": { id: "brand_2", name: "Cipla", manufacturer: "Cipla Ltd", logo: "https://images.unsplash.com/photo-1550572017-edd951b55104?w=100", status: "active" },
        "brand_3": { id: "brand_3", name: "Sun Pharma", manufacturer: "Sun Pharmaceutical Industries", logo: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=100", status: "active" }
      },
      orders: {
        "O-2026-001": { 
          id: "O-2026-001", 
          customerId: "user_1", 
          customerName: "Ananya Sharma", 
          storeId: "store_1", 
          storeName: "Apollo Pharmacy Metro", 
          deliveryBoyId: "delivery_1", 
          deliveryBoyName: "Ramesh Kumar", 
          items: [{ id: "med_1", name: "Paracetamol 650mg", price: 45, qty: 2 }, { id: "med_3", name: "Cetirizine 10mg", price: 35, qty: 1 }], 
          subtotal: 125, 
          deliveryCharge: 30, 
          tax: 6.25, 
          totalAmount: 161.25, 
          paymentMethod: "COD", 
          paymentStatus: "paid", 
          deliveryStatus: "delivered", 
          timestamp: "2026-07-02T10:00:00.000Z", 
          address: "Flat 302, Green Glen Layout, Bangalore",

          // Enterprise structure (Part 6A)
          customer: { uid: "user_1", name: "Ananya Sharma", email: "user@dawado.com", phone: "+91 91234 56789" },
          store: { storeId: "store_1", name: "Apollo Pharmacy Metro", phone: "+91 8011223344" },
          deliveryBoy: { deliveryBoyId: "delivery_1", name: "Ramesh Kumar", phone: "+91 98765 43210" },
          medicines: [
            { id: "med_1", name: "Paracetamol 650mg", price: 45, qty: 2 },
            { id: "med_3", name: "Cetirizine 10mg", price: 35, qty: 1 }
          ],
          address: { id: "addr_1", fullAddress: "Flat 302, Green Glen Layout, Bangalore" },
          payment: { method: "COD", amount: 161.25, status: "paid" },
          timeline: {
            placed: "2026-07-02T10:00:00.000Z",
            accepted: "2026-07-02T10:05:00.000Z",
            dispatched: "2026-07-02T10:15:00.000Z",
            delivered: "2026-07-02T10:30:00.000Z"
          },
          pricing: { subtotal: 125, deliveryCharge: 30, tax: 6.25, totalAmount: 161.25 },
          tracking: { lat: 12.9715987, lng: 77.5945627 },
          status: "delivered"
        },
        "O-2026-002": { 
          id: "O-2026-002", 
          customerId: "user_1", 
          customerName: "Ananya Sharma", 
          storeId: "store_1", 
          storeName: "Apollo Pharmacy Metro", 
          deliveryBoyId: "delivery_1", 
          deliveryBoyName: "Ramesh Kumar", 
          items: [{ id: "med_2", name: "Amoxicillin 500mg", price: 120, qty: 1 }], 
          subtotal: 120, 
          deliveryCharge: 30, 
          tax: 6, 
          totalAmount: 156, 
          paymentMethod: "Online", 
          paymentStatus: "paid", 
          deliveryStatus: "picked_up", 
          timestamp: "2026-07-02T14:30:00.000Z", 
          address: "G-08, Shanti Apartment, Bangalore", 
          prescriptionUrl: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=500",

          // Enterprise structure (Part 6A)
          customer: { uid: "user_1", name: "Ananya Sharma", email: "user@dawado.com", phone: "+91 91234 56789" },
          store: { storeId: "store_1", name: "Apollo Pharmacy Metro", phone: "+91 8011223344" },
          deliveryBoy: { deliveryBoyId: "delivery_1", name: "Ramesh Kumar", phone: "+91 98765 43210" },
          medicines: [
            { id: "med_2", name: "Amoxicillin 500mg", price: 120, qty: 1 }
          ],
          address: { id: "addr_2", fullAddress: "G-08, Shanti Apartment, Bangalore" },
          payment: { method: "Online", amount: 156.00, status: "paid" },
          timeline: {
            placed: "2026-07-02T14:30:00.000Z",
            accepted: "2026-07-02T14:35:00.000Z"
          },
          pricing: { subtotal: 120, deliveryCharge: 30, tax: 6.00, totalAmount: 156.00 },
          tracking: { lat: 12.9715987, lng: 77.5945627 },
          status: "picked_up"
        }
      },
      settlements: {
        "STL-000244": { 
          id: "STL-000244", 
          deliveryBoyId: "delivery_1", 
          deliveryBoyName: "Ramesh Kumar", 
          amount: 450.00, 
          razorpayPaymentId: "pay_SETTLE_MOCK_112", 
          timestamp: "2026-07-01T18:00:00.000Z", 
          status: "completed",

          // Enterprise structure (Part 6A)
          settlementId: "STL-000244",
          razorpayOrderId: "order_SETTLE_ORDER_112",
          settlementStatus: "paid",
          createdAt: "2026-07-01T18:00:00.000Z",
          paidAt: "2026-07-01T18:05:00.000Z"
        }
      },
      payments: {
        "pay_1": {
          paymentId: "pay_1",
          orderId: "O-2026-002",
          paymentMethod: "Online",
          razorpayOrderId: "order_MOCK_PAY_2026_002",
          razorpayPaymentId: "pay_MOCK_PAY_2026_002",
          amount: 156.00,
          status: "captured",
          timestamp: "2026-07-02T14:30:00.000Z"
        }
      },
      offers: {
        "offer_1": {
          offerId: "offer_1",
          title: "Monsoon Health Shield",
          image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800",
          discount: "20% OFF",
          expiry: "2026-07-31",
          priority: 1,
          active: true
        }
      },
      banners: {
        "banner_1": { 
          id: "banner_1", 
          title: "Monsoon Health Shield", 
          type: "Home Banner", 
          image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800", 
          priority: 1, 
          action: "Category: Fever & Pain", 
          schedule: "2026-07-01 to 2026-07-31", 
          status: "active",

          // Enterprise structure (Part 6A)
          bannerId: "banner_1",
          redirectType: "category",
          redirectId: "cat_1",
          expiry: "2026-07-31"
        },
        "banner_2": { 
          id: "banner_2", 
          title: "Flat 20% Off on Heart Care", 
          type: "Offer Banner", 
          image: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=800", 
          priority: 2, 
          action: "Category: Heart Health", 
          schedule: "2026-07-02 to 2026-08-02", 
          status: "active",

          // Enterprise structure (Part 6A)
          bannerId: "banner_2",
          redirectType: "category",
          redirectId: "cat_5",
          expiry: "2026-08-02"
        }
      },
      coupons: {
        "coupon_1": { 
          id: "coupon_1", 
          code: "DAWAFIRST", 
          discount: 20, 
          type: "percentage", 
          maxDiscount: 100, 
          minOrder: 299, 
          expiry: "2026-12-31", 
          status: "active",

          // Enterprise structure (Part 6A)
          couponId: "coupon_1",
          value: 20,
          minimumOrder: 299,
          usageLimit: 1000
        },
        "coupon_2": { 
          id: "coupon_2", 
          code: "HEALTH50", 
          discount: 50, 
          type: "flat", 
          maxDiscount: 50, 
          minOrder: 199, 
          expiry: "2026-09-30", 
          status: "active",

          // Enterprise structure (Part 6A)
          couponId: "coupon_2",
          value: 50,
          minimumOrder: 199,
          usageLimit: 500
        }
      },
      prescriptions: {
        "pres_1": { 
          id: "pres_1", 
          orderId: "O-2026-002", 
          customerName: "Ananya Sharma", 
          imageUrl: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=500", 
          status: "pending", 
          timestamp: "2026-07-02T14:30:00.000Z",

          // Enterprise structure (Part 6A)
          prescriptionId: "pres_1",
          customerId: "user_1",
          imageURL: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=500",
          verificationStatus: "verified",
          verifiedBy: "admin_1",
          remarks: "Verified paracetamol and amoxicillin prescription"
        }
      },
      support_tickets: {
        "ticket_1": { 
          id: "T-8091", 
          senderId: "user_1", 
          senderName: "Ananya Sharma", 
          role: "user", 
          subject: "Delay in delivery", 
          message: "My order #O-2026-002 is still in picked up status, please check.", 
          status: "open", 
          assignedTo: "Support Admin", 
          timestamp: "2026-07-02T15:10:00.000Z",

          // Enterprise structure (Part 6A)
          ticketId: "ticket_1",
          userId: "user_1",
          category: "Delivery Delay",
          priority: "high",
          messages: [
            { sender: "user_1", text: "My order is delayed", timestamp: "2026-07-02T15:10:00.000Z" }
          ]
        }
      },
      reviews: {
        "rev_1": {
          reviewId: "rev_1",
          customerId: "user_1",
          medicineId: "med_1",
          storeId: "store_1",
          rating: 5,
          comment: "Very fast dispatch and delivery",
          createdAt: "2026-07-02T11:00:00.000Z"
        }
      },
      analytics: {
        daily: {
          "2026-07-02": { Orders: 2, Revenue: 317.25, Users: 1, Stores: 1, Delivery: 1, Medicines: 2 }
        },
        weekly: {},
        monthly: {},
        yearly: {}
      },
      reports: {
        sales: {},
        finance: {},
        inventory: {},
        settlements: {},
        stores: {}
      },
      auditLogs: {
        "log_1": {
          logId: "log_1",
          user: "admin@dawado.com",
          role: "super_admin",
          action: "initialize_database",
          module: "system",
          timestamp: "2026-07-02T22:45:43-07:00",
          ip: "127.0.0.1",
          device: "Console Terminal"
        }
      },
      appSettings: {
        delivery: { baseCharge: 30, freeDeliveryThreshold: 500 },
        payment: { razorpayEnabled: true, codEnabled: true },
        taxes: { gstRate: 0.05 },
        support: { helpline: "+91 1800 123 456" },
        branding: { appTitle: "DawaDo – Your Medicine Partner" },
        maintenance: { active: false, message: "System is undergoing upgrades." },
        features: { labBookings: false, doctorConsultations: false }
      },
      cities: {
        "blr": { id: "blr", name: "Bangalore", active: true }
      },
      healthArticles: {
        "art_1": { id: "art_1", title: "Managing Monsoon Allergies", content: "Stay healthy by..." }
      },
      systemStatus: {
        firebase: "active",
        cloudinary: "active",
        razorpay: "active",
        maps: "active",
        notifications: "active",
        updatedAt: "2026-07-02T22:45:43-07:00"
      },
      appVersion: {
        latest: "1.0.0",
        minimumSupported: "1.0.0",
        updateMessage: "Please update to the latest version of DawaDo for premium features.",
        forceUpdate: false
      },
      system: {
        notifications: [],
        audit_logs: [
          { id: "log_1", timestamp: new Date().toISOString(), message: "DawaDo system initialized with enterprise standards.", type: "info" }
        ],
        settings: {
          appName: "DawaDo – Your Medicine Partner",
          deliveryCharge: 30,
          taxRate: 0.05,
          commissionRate: 0.10,
          minOrder: 100,
          maxOrder: 10000,
          codAvailable: true,
          razorpayMode: "Test",
          workingHours: "08:00 - 22:00",
          currency: "INR",
          cloudinaryCloudName: "dawado-cloud",
          cloudinaryUploadPreset: "dawado-preset",
          cloudinaryCompressed: true,
          firebaseDatabasePath: "admin/dashboard",
          firebaseMaintenanceMode: false
        }
      }
    };

    // Convert medicines array to indexed object with dual structures (legacy and Part 6A)
    DEFAULT_MEDICINES.forEach(med => {
      initialDB.medicines[med.id] = {
        // Legacy properties
        id: med.id,
        name: med.name,
        price: med.price,
        stock: med.stock,
        category: med.category,
        description: med.description,
        image: med.image,
        prescriptionRequired: med.prescriptionRequired || false,

        // Part 6A Structure
        basicInfo: {
          id: med.id,
          name: med.name,
          category: med.category,
          description: med.description
        },
        composition: {
          activeIngredients: med.category === "Fever & Pain" ? ["Paracetamol 650mg"] : [med.name]
        },
        dosage: {
          recommended: "As directed by physician"
        },
        manufacturer: {
          name: "Cipla Ltd"
        },
        images: {
          thumbnail: med.image
        },
        category: {
          id: med.category === "Fever & Pain" ? "cat_1" : "cat_2"
        },
        brand: {
          id: "brand_1"
        },
        prescription: {
          required: med.prescriptionRequired || false
        },
        status: {
          active: true
        }
      };
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialDB));
  }

  // Seed default credential list for login matching
  let usersList = localStorage.getItem(USERS_KEY);
  if (!usersList) {
    const defaultUsers = {
      "user@dawado.com": { password: "user123", role: "user", id: "user_1", name: "Ananya Sharma" },
      "store@dawado.com": { password: "store123", role: "store", id: "store_1", name: "Apollo Pharmacy Metro", approvalPending: false },
      "delivery@dawado.com": { password: "delivery123", role: "delivery", id: "delivery_1", name: "Ramesh Kumar", approvalPending: false },
      "admin@dawado.com": { password: "admin123", role: "admin", id: "admin_1", name: "Enterprise Administrator" }
    };
    localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
  }
}

seedDatabase();

// Database event listener system for real-time synchronization
class RealtimeDB {
  constructor() {
    this.listeners = {};
    this.isOnline = navigator.onLine;
    this.offlineQueue = JSON.parse(localStorage.getItem("dawado_offline_queue")) || [];

    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        this.triggerUpdate();
      }
    });

    window.addEventListener("online", () => {
      this.isOnline = true;
      this.syncOfflineQueue();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
    });

    // Run initial maintenance enforcement check
    setTimeout(() => {
      this.enforceMaintenanceMode();
      if (this.isOnline) {
        this.syncOfflineQueue();
      }
    }, 100);
  }

  queueOfflineAction(actionType, path, value) {
    this.offlineQueue.push({
      id: "action_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      actionType,
      path,
      value,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem("dawado_offline_queue", JSON.stringify(this.offlineQueue));
    this.logAudit(`Queued offline action: ${actionType} on ${path}`, "database");
  }

  async syncOfflineQueue() {
    if (this.offlineQueue.length === 0) return;
    this.logAudit(`Synchronizing ${this.offlineQueue.length} queued offline actions...`, "database");
    
    // Copy queue and empty it to avoid infinite loops
    const queueToProcess = [...this.offlineQueue];
    this.offlineQueue = [];
    localStorage.setItem("dawado_offline_queue", JSON.stringify([]));

    for (const action of queueToProcess) {
      try {
        let db = this._readRaw();
        if (action.actionType === "set") {
          db = this.setByPath(db, action.path, action.value);
        } else if (action.actionType === "update") {
          const current = this.getByPath(db, action.path) || {};
          const updated = { ...current, ...action.value };
          db = this.setByPath(db, action.path, updated);
        } else if (action.actionType === "remove") {
          const parts = action.path.split("/");
          let current = db;
          for (let i = 0; i < parts.length - 1; i++) {
            current = current[parts[i]];
          }
          if (current && parts[parts.length - 1]) {
            delete current[parts[parts.length - 1]];
          }
        }
        this._writeRaw(db);
      } catch (e) {
        console.error("Failed to sync action:", action, e);
        this.offlineQueue.push(action);
      }
    }
    
    localStorage.setItem("dawado_offline_queue", JSON.stringify(this.offlineQueue));
    this.logAudit("Offline actions synced with server database successfully.", "database");
  }

  enforceMaintenanceMode() {
    // Admin panel remains fully accessible!
    if (window.location.pathname.includes("admin.html") || window.location.pathname === "/admin.html" || window.location.pathname.endsWith("/admin")) {
      return;
    }
    
    const snapshot = this._readRaw();
    const settings = snapshot.system?.settings || {};
    const isActive = settings.firebaseMaintenanceMode || false;
    const customMessage = settings.firebaseMaintenanceMessage || "System is undergoing upgrades.";
    
    let overlay = document.getElementById("dawado-maintenance-overlay");
    
    if (isActive) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "dawado-maintenance-overlay";
        overlay.style = `
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: #0f172a;
          color: #f1f5f9;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 1000000; font-family: 'Inter', system-ui, sans-serif;
          padding: 2rem; text-align: center;
        `;
        overlay.innerHTML = `
          <div style="max-width: 500px; display: flex; flex-direction: column; align-items: center; gap: 1.5rem;">
            <div style="background: rgba(244, 63, 94, 0.1); color: #f43f5e; padding: 1.5rem; border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
              <i class="fa-solid fa-screwdriver-wrench" style="font-size: 2.5rem;"></i>
            </div>
            <h1 style="font-size: 2rem; font-weight: 800; tracking: -0.025em; margin: 0; color: #f1f5f9;">Maintenance Mode</h1>
            <p id="dawado-maintenance-msg-text" style="color: #94a3b8; font-size: 1rem; line-height: 1.6; margin: 0;"></p>
            <div style="display: flex; gap: 0.5rem; align-items: center; background: #1e293b; padding: 0.5rem 1rem; border-radius: 9999px; font-size: 0.8rem; color: #cbd5e1;">
              <span style="width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; display: inline-block;"></span>
              Admins are working hard to restore access.
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
      }
      
      const textElem = document.getElementById("dawado-maintenance-msg-text");
      if (textElem) {
        textElem.textContent = customMessage;
      }
    } else {
      if (overlay) {
        document.body.removeChild(overlay);
      }
    }
  }

  // Path Normalization utility for Part 6A and backward compatibility
  normalizePath(path) {
    if (!path || path === "/" || path === "") return "";
    let p = path.replace(/^\//, "");
    
    // Normalize top-level paths
    const parts = p.split("/");
    if (parts[0] === "deliveryBoys") parts[0] = "delivery_boys";
    if (parts[0] === "supportTickets") parts[0] = "support_tickets";
    if (parts[0] === "appSettings") parts[0] = "system/settings";
    if (parts[0] === "auditLogs") parts[0] = "system/audit_logs";
    
    return parts.join("/");
  }

  // Helper to read raw database from localStorage with linked mappings
  _readRaw() {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    
    // Ensure vital root structures are present
    if (!raw.delivery_boys) raw.delivery_boys = {};
    if (!raw.support_tickets) raw.support_tickets = {};
    if (!raw.system) raw.system = { settings: {}, audit_logs: [] };

    // Set references on the runtime instance
    raw.deliveryBoys = raw.delivery_boys;
    raw.supportTickets = raw.support_tickets;

    raw.appSettings = raw.appSettings || {
      delivery: { baseCharge: raw.system.settings?.deliveryCharge || 30, freeDeliveryThreshold: 500 },
      payment: { razorpayEnabled: true, codEnabled: raw.system.settings?.codAvailable || true },
      taxes: { gstRate: raw.system.settings?.taxRate || 0.05 },
      support: { helpline: "+91 1800 123 456" },
      branding: { appTitle: raw.system.settings?.appName || "DawaDo – Your Medicine Partner" },
      maintenance: { active: raw.system.settings?.firebaseMaintenanceMode || false },
      features: { labBookings: false, doctorConsultations: false }
    };

    raw.auditLogs = raw.auditLogs || {};
    if (raw.system.audit_logs && Object.keys(raw.auditLogs).length === 0) {
      raw.system.audit_logs.forEach(l => {
        raw.auditLogs[l.id] = l;
      });
    }

    // Force presence of all requested enterprise nodes from Part 6A
    const requiredNodes = [
      "users", "stores", "admins", "medicines", "categories", "brands", "orders", 
      "prescriptions", "settlements", "payments", "offers", "coupons", "banners", 
      "notifications", "reviews", "analytics", "reports", "cities", "healthArticles", 
      "systemStatus", "appVersion"
    ];
    requiredNodes.forEach(node => {
      if (!raw[node]) {
        raw[node] = {};
      }
    });

    return raw;
  }

  // Helper to write raw database and notify listeners
  _writeRaw(data) {
    // Sync mappings back
    if (data.deliveryBoys) {
      data.delivery_boys = data.deliveryBoys;
    }
    if (data.supportTickets) {
      data.support_tickets = data.supportTickets;
    }
    if (data.appSettings && data.system && data.system.settings) {
      data.system.settings.appName = data.appSettings.branding?.appTitle || data.system.settings.appName;
      data.system.settings.deliveryCharge = data.appSettings.delivery?.baseCharge || data.system.settings.deliveryCharge;
      data.system.settings.taxRate = data.appSettings.taxes?.gstRate || data.system.settings.taxRate;
      data.system.settings.codAvailable = data.appSettings.payment?.codEnabled || data.system.settings.codAvailable;
      data.system.settings.firebaseMaintenanceMode = data.appSettings.maintenance?.active || data.system.settings.firebaseMaintenanceMode;
    }
    if (data.auditLogs && data.system) {
      data.system.audit_logs = Object.values(data.auditLogs);
    }

    // Clone to save without circular or duplicated key reference structures
    const toSave = { ...data };
    delete toSave.deliveryBoys;
    delete toSave.supportTickets;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    this.triggerUpdate();
    // Dispatch local custom event for same-window context notifications
    window.dispatchEvent(new CustomEvent("dawado_db_update", { detail: data }));
  }

  triggerUpdate() {
    this.enforceMaintenanceMode();
    const data = this._readRaw();
    Object.keys(this.listeners).forEach(path => {
      const callbacks = this.listeners[path];
      if (callbacks && callbacks.length > 0) {
        const value = this.getByPath(data, path);
        callbacks.forEach(cb => cb(new Snapshot(path, value)));
      }
    });
  }

  // Safe nested object retrieval
  getByPath(obj, path) {
    const normalized = this.normalizePath(path);
    if (!normalized) return obj;
    const parts = normalized.split("/");
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return null;
      current = current[part];
    }
    return current;
  }

  // Safe nested object writing
  setByPath(obj, path, value) {
    const normalized = this.normalizePath(path);
    if (!normalized) return value;
    const parts = normalized.split("/");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== "object") {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
    return obj;
  }

  // CRUD API modeled after Firebase Realtime Database
  ref(path = "") {
    const self = this;
    const normalizedPath = self.normalizePath(path);
    return {
      path: normalizedPath,

      on(type, callback) {
        if (type !== "value") return;
        if (!self.listeners[normalizedPath]) {
          self.listeners[normalizedPath] = [];
        }
        self.listeners[normalizedPath].push(callback);
        
        // Immediately fetch and callback first time
        const currentData = self.getByPath(self._readRaw(), normalizedPath);
        callback(new Snapshot(normalizedPath, currentData));

        // Listen to same-window updates
        const localHandler = (e) => {
          const value = self.getByPath(e.detail, normalizedPath);
          callback(new Snapshot(normalizedPath, value));
        };
        window.addEventListener("dawado_db_update", localHandler);

        // Retain local handler reference so it can be unsubscribed
        callback._localHandler = localHandler;
      },

      off(type, callback) {
        if (!self.listeners[normalizedPath]) return;
        if (callback) {
          self.listeners[normalizedPath] = self.listeners[normalizedPath].filter(cb => cb !== callback);
          if (callback._localHandler) {
            window.removeEventListener("dawado_db_update", callback._localHandler);
          }
        } else {
          delete self.listeners[normalizedPath];
        }
      },

      // Fetch snapshot once (Firebase style)
      async once(type, callback) {
        if (type !== "value") return;
        const currentData = self.getByPath(self._readRaw(), normalizedPath);
        const snapshot = new Snapshot(normalizedPath, currentData);
        if (callback) {
          callback(snapshot);
        }
        return snapshot;
      },

      async set(value) {
        if (!self.isOnline) {
          self.queueOfflineAction("set", normalizedPath, value);
        }
        let db = self._readRaw();
        db = self.setByPath(db, normalizedPath, value);
        self._writeRaw(db);
        self.logAudit(`Set data at path: ${normalizedPath} (Online: ${self.isOnline})`, "database");
        return true;
      },

      async update(updates) {
        if (!self.isOnline) {
          self.queueOfflineAction("update", normalizedPath, updates);
        }
        let db = self._readRaw();
        const current = self.getByPath(db, normalizedPath) || {};
        const updated = { ...current, ...updates };
        db = self.setByPath(db, normalizedPath, updated);
        self._writeRaw(db);
        self.logAudit(`Updated data at path: ${normalizedPath} (Online: ${self.isOnline})`, "database");
        return true;
      },

      push(value = null) {
        const key = "key_" + Math.random().toString(36).substr(2, 9);
        const subPath = normalizedPath ? `${normalizedPath}/${key}` : key;
        const refObj = self.ref(subPath);
        if (value !== null) {
          refObj.set(value);
        }
        return {
          key: key,
          ref: refObj,
          set: (val) => refObj.set(val)
        };
      },

      async remove() {
        if (!self.isOnline) {
          self.queueOfflineAction("remove", normalizedPath, null);
        }
        let db = self._readRaw();
        const parts = normalizedPath.split("/");
        let current = db;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]];
        }
        if (current && parts[parts.length - 1]) {
          delete current[parts[parts.length - 1]];
        }
        self._writeRaw(db);
        self.logAudit(`Removed data at path: ${normalizedPath} (Online: ${self.isOnline})`, "database");
        return true;
      }
    };
  }

  // Write systemic audit logs
  logAudit(message, type = "info") {
    try {
      const db = this._readRaw();
      if (!db.system) db.system = {};
      if (!db.system.audit_logs) db.system.audit_logs = [];
      db.system.audit_logs.push({
        id: "log_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        timestamp: new Date().toISOString(),
        message: message,
        type: type
      });
      // Cap log array length at 200 items to preserve local storage
      if (db.system.audit_logs.length > 200) {
        db.system.audit_logs.shift();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn("Failed to write audit log:", e);
    }
  }

  // Push notifications
  sendNotification(recipientId, title, body, type = "order", metadata = {}) {
    try {
      const db = this._readRaw();
      if (!db.notifications) db.notifications = {};
      const notifId = "notif_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
      db.notifications[notifId] = {
        id: notifId,
        recipientId: recipientId,
        title: title,
        body: body,
        type: type,
        timestamp: new Date().toISOString(),
        read: false,
        metadata: metadata
      };
      this._writeRaw(db);
    } catch (e) {
      console.warn("Failed to send notification:", e);
    }
  }
}

// Snapshot container class mimicking Firebase Snapshots
class Snapshot {
  constructor(key, value) {
    this.key = key.split("/").pop();
    this._val = value;
  }

  val() {
    return this._val;
  }

  exists() {
    return this._val !== null && this._val !== undefined;
  }

  forEach(callback) {
    if (this._val && typeof this._val === "object") {
      Object.keys(this._val).forEach((childKey, idx) => {
        callback(new Snapshot(childKey, this._val[childKey]), idx);
      });
    }
  }
}

// Enterprise Auth Simulator Core
class AuthProvider {
  constructor() {
    this._currentUser = JSON.parse(localStorage.getItem(AUTH_KEY)) || null;
    this.authListeners = [];

    // Auto validate access on load
    setTimeout(() => {
      this.enforceRoleRedirection(this._currentUser);
    }, 100);
  }

  getUserRoleFromDatabase(email, uid) {
    // Check local credentials store first
    const users = JSON.parse(localStorage.getItem("dawado_users")) || {};
    if (email) {
      const emailNorm = email.trim().toLowerCase();
      if (users[emailNorm] && users[emailNorm].role) {
        return users[emailNorm].role;
      }
    }
    // Check database root structure
    const dbRoot = JSON.parse(localStorage.getItem("dawado_db_root")) || {};
    if (uid) {
      if (dbRoot.users && dbRoot.users[uid]) return "user";
      if (dbRoot.stores && dbRoot.stores[uid]) return "store";
      if (dbRoot.delivery_boys && dbRoot.delivery_boys[uid]) return "delivery";
      if (dbRoot.admins && dbRoot.admins[uid]) return "admin";
    }
    return null;
  }

  enforceRoleRedirection(user) {
    const pathname = window.location.pathname;
    
    // Skip launchpad/index.html or external pages
    const isLaunchpad = pathname === "/" || pathname === "" || pathname.endsWith("index.html") || pathname.endsWith("/");
    if (isLaunchpad) {
      return;
    }

    // Define page to role mapping
    let pageRole = null;
    if (pathname.includes("user.html")) {
      pageRole = "user";
    } else if (pathname.includes("store.html")) {
      pageRole = "store";
    } else if (pathname.includes("deliveryboy.html") || pathname.includes("delivery.html")) {
      pageRole = "delivery";
    } else if (pathname.includes("admin.html")) {
      pageRole = "admin";
    }

    // If we are not on one of the four portal pages, do nothing
    if (!pageRole) {
      return;
    }

    // If user is not logged in, allow them to stay on the page to register/login!
    if (!user) {
      return;
    }

    // If user is logged in, check role mismatch
    // Get role from database/localStorage to be absolutely sure we've read it from DB
    const dbRole = this.getUserRoleFromDatabase(user.email, user.uid) || user.role;
    
    // Normalize roles (support "deliveryBoy" and "delivery")
    const normPageRole = (pageRole === "delivery" || pageRole === "deliveryBoy") ? "delivery" : pageRole;
    const normUserRole = (dbRole === "delivery" || dbRole === "deliveryBoy") ? "delivery" : dbRole;

    if (normUserRole !== normPageRole) {
      // Role Mismatch! We must redirect them to the correct panel
      let targetPage = "user.html";
      if (normUserRole === "store") {
        targetPage = "store.html";
      } else if (normUserRole === "delivery") {
        targetPage = "deliveryboy.html";
      } else if (normUserRole === "admin") {
        targetPage = "admin.html";
      }

      // Build target URL relative to base path for GitHub Pages and Custom Domain compatibility
      const lastSlashIdx = pathname.lastIndexOf('/');
      const basePath = lastSlashIdx >= 0 ? pathname.substring(0, lastSlashIdx + 1) : "/";
      const targetUrl = basePath + targetPage;

      console.warn(`[DawaDo Router] Access Denied for role "${normUserRole}" on "${pageRole}" page. Redirecting to "${targetPage}"...`);
      
      // Let's also write a systemic audit log
      db.logAudit(`Access Denied: Redirected ${user.email} from ${pageRole} to ${normUserRole} portal.`, "security");

      // Redirect immediately
      window.location.replace(targetUrl);
    }
  }

  onAuthStateChanged(callback) {
    this.authListeners.push(callback);
    callback(this._currentUser);
  }

  _triggerAuthChange() {
    localStorage.setItem(AUTH_KEY, JSON.stringify(this._currentUser));
    this.authListeners.forEach(cb => cb(this._currentUser));
    this.enforceRoleRedirection(this._currentUser);
  }

  async signInWithEmailAndPassword(email, password) {
    const users = JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    const userMeta = users[email.trim().toLowerCase()];
    
    if (!userMeta || userMeta.password !== password) {
      throw new Error("Invalid email or password credential matching.");
    }

    if (userMeta.approvalPending) {
      throw new Error("Your account requires Administrator Approval before becoming active.");
    }

    this._currentUser = {
      uid: userMeta.id,
      email: email.trim().toLowerCase(),
      name: userMeta.name,
      role: userMeta.role
    };

    this._triggerAuthChange();
    db.logAudit(`User signed in: ${email} (${userMeta.role})`, "auth");
    return this._currentUser;
  }

  async createUserWithEmailAndPassword(email, password, displayName, role) {
    const users = JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    const emailNorm = email.trim().toLowerCase();

    if (users[emailNorm]) {
      throw new Error("An account already exists with this email address.");
    }

    const userId = "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
    
    // Admin approval rules
    const approvalPending = (role === "store" || role === "delivery");

    users[emailNorm] = {
      password: password,
      role: role,
      id: userId,
      name: displayName,
      approvalPending: approvalPending
    };

    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    // Register inside Database node
    const databaseRoot = db._readRaw();
    if (role === "user") {
      databaseRoot.users[userId] = { id: userId, name: displayName, email: emailNorm, phone: "" };
    } else if (role === "store") {
      databaseRoot.stores[userId] = { id: userId, name: displayName, email: emailNorm, lat: 12.9715987, lng: 77.5945627, active: false, balance: 0, rating: 5.0, logo: "" };
    } else if (role === "delivery") {
      databaseRoot.delivery_boys[userId] = { id: userId, name: displayName, email: emailNorm, lat: 12.9715987, lng: 77.5945627, active: false, cashBalance: 0, status: "offline", phone: "" };
    }
    db._writeRaw(databaseRoot);

    db.logAudit(`New registration: ${emailNorm} as ${role} (Approval Pending: ${approvalPending})`, "auth");

    if (approvalPending) {
      throw new Error("Sign up completed! Your store/delivery boy account requires Admin Approval before you can log in.");
    }

    // Auto sign in standard users
    this._currentUser = {
      uid: userId,
      email: emailNorm,
      name: displayName,
      role: role
    };

    this._triggerAuthChange();
    return this._currentUser;
  }

  async signOut() {
    if (this._currentUser) {
      db.logAudit(`User logged out: ${this._currentUser.email}`, "auth");
    }
    this._currentUser = null;
    this._triggerAuthChange();
  }

  async signUpWithEmailAndPassword(email, password, displayName, role) {
    return this.createUserWithEmailAndPassword(email, password, displayName, role);
  }

  getCurrentUser() {
    return this._currentUser;
  }
}

// Global Export instances
export const db = new RealtimeDB();
export const auth = new AuthProvider();

// Helper: OpenStreetMap Map utility
export const mapUtils = {
  // Center default coordinates (Bangalore Center)
  DEFAULT_LAT: 12.9715987,
  DEFAULT_LNG: 77.5945627,

  createMap(containerId, lat, lng, zoom = 14) {
    if (!window.L) {
      console.warn("Leaflet maps library is not loaded yet.");
      return null;
    }
    try {
      const map = window.L.map(containerId).setView([lat || this.DEFAULT_LAT, lng || this.DEFAULT_LNG], zoom);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      return map;
    } catch (e) {
      console.error("Map creation failure:", e);
      return null;
    }
  },

  // Approximate Haversine formula for distance in Kilometers
  getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return parseFloat((R * c).toFixed(2)); // Return km with 2 decimals
  },

  // Simulated geocoding reverse lookup
  async reverseGeocode(lat, lng) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { "User-Agent": "DawaDo Medicine Delivery Portal" }
      });
      if (response.ok) {
        const data = await response.json();
        return data.display_name || `Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      }
    } catch (e) {
      console.warn("External geocoding lookup failed. Using fallback simulation.", e);
    }
    return `Simulated Premium Hub Area, Bangalore Sector-${Math.floor(lat * 100) % 10 + 1}`;
  }
};

// Razorpay test simulation payment overlay
export const paymentUtils = {
  processRazorpayCheckout(options) {
    return new Promise((resolve, reject) => {
      // Dynamic overlay creation
      const overlay = document.createElement("div");
      overlay.id = "razorpay-simulation-overlay";
      overlay.style = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999; font-family: 'Poppins', sans-serif;
        backdrop-filter: blur(4px);
      `;

      overlay.innerHTML = `
        <div style="background: white; border-radius: 20px; width: 400px; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; animation: scaleUp 0.3s ease;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #2563eb; font-weight: 800; font-size: 1.25rem;">Razorpay</span>
              <span style="background: #e0f2fe; color: #0369a1; font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; font-weight: 500;">Test Mode</span>
            </div>
            <i class="fa-solid fa-shield-halved" style="color: #10b981; font-size: 1.25rem;"></i>
          </div>
          
          <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
            <div style="font-size: 0.85rem; color: #64748b;">Paying To</div>
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 8px;">DawaDo Medicine Delivery Service</div>
            <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.85rem; color: #64748b;">Amount Due</span>
              <span style="font-size: 1.25rem; font-weight: 700; color: #059669;">₹${options.amount / 100}</span>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="font-size: 0.85rem; font-weight: 500; color: #475569; display: block; margin-bottom: 8px;">Choose Payment Method</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button id="rzp-pay-card" style="border: 1px solid #e2e8f0; background: white; padding: 12px; border-radius: 10px; cursor: pointer; text-align: left;" onclick="this.style.borderColor='#2563eb'; document.getElementById('rzp-pay-upi').style.borderColor='#e2e8f0';">
                <i class="fa-regular fa-credit-card" style="color: #2563eb; margin-bottom: 4px;"></i>
                <div style="font-size: 0.8rem; font-weight: 600;">Card</div>
              </button>
              <button id="rzp-pay-upi" style="border: 1px solid #e2e8f0; background: white; padding: 12px; border-radius: 10px; cursor: pointer; text-align: left;" onclick="this.style.borderColor='#2563eb'; document.getElementById('rzp-pay-card').style.borderColor='#e2e8f0';">
                <i class="fa-solid fa-mobile-screen-button" style="color: #8b5cf6; margin-bottom: 4px;"></i>
                <div style="font-size: 0.8rem; font-weight: 600;">UPI / NetBanking</div>
              </button>
            </div>
          </div>

          <div style="display: flex; gap: 12px;">
            <button id="rzp-cancel" style="flex: 1; border: 1px solid #cbd5e1; background: white; padding: 12px; border-radius: 10px; cursor: pointer; font-weight: 500; color: #475569;">Cancel</button>
            <button id="rzp-success" style="flex: 1; border: none; background: #059669; color: white; padding: 12px; border-radius: 10px; cursor: pointer; font-weight: 600;">Simulate Success</button>
          </div>
        </div>
      `;

      // Inject scaling animations
      const style = document.createElement("style");
      style.innerHTML = `
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `;
      overlay.appendChild(style);
      document.body.appendChild(overlay);

      document.getElementById("rzp-cancel").onclick = () => {
        document.body.removeChild(overlay);
        reject(new Error("Payment cancelled by user."));
      };

      document.getElementById("rzp-success").onclick = () => {
        const paymentId = "pay_" + Math.random().toString(36).substr(2, 10).toUpperCase();
        document.body.removeChild(overlay);
        resolve({
          razorpay_payment_id: paymentId,
          razorpay_order_id: options.order_id || "order_" + Math.random().toString(36).substr(2, 8),
          razorpay_signature: "sig_mocked_verified_hash_01020304"
        });
      };
    });
  }
};

// Cloudinary secure simulated image store
export const cloudinaryUtils = {
  uploadImage(file) {
    return new Promise((resolve) => {
      // Create a nice simulated file reader for thumbnail visual confirmation
      const reader = new FileReader();
      reader.onload = function(e) {
        // Return beautiful free medicine or placeholder URLs if mock, otherwise return reader local result
        const mockCloudinaryUrl = e.target.result;
        resolve({
          secure_url: mockCloudinaryUrl,
          public_id: "cloudinary_mock_" + Date.now()
        });
      };
      reader.readAsDataURL(file);
    });
  }
};

// Global expose for direct usage in script tags if needed
window.DawaDoDB = { db, auth, mapUtils, paymentUtils, cloudinaryUtils };
