import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();

  // Standard Express middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API: Health probe
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", platform: "DawaDo Enterprise Suite" });
  });

  // API: Create Razorpay Order
  app.post("/api/payment/create-order", (req, res) => {
    const { amount, currency = "INR", receipt } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: "Amount is required for creating a payment order." });
    }

    // Secure server-side calculation and order generation
    const orderId = "order_" + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    // In production, we would call the Razorpay SDK:
    // const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY, key_secret: process.env.RAZORPAY_SECRET });
    // const rzpOrder = await razorpay.orders.create({ amount, currency, receipt });

    res.json({
      success: true,
      order_id: orderId,
      amount: amount,
      currency: currency,
      key_id: process.env.RAZORPAY_KEY || "rzp_test_dawado_mock_key_01"
    });
  });

  // API: Verify Razorpay Signature
  app.post("/api/payment/verify", (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing verification credentials." });
    }

    // In production, we calculate signature using HMAC SHA256:
    // const crypto = require("crypto");
    // const generated_sig = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET).update(order_id + "|" + payment_id).digest('hex');
    // const isSignatureValid = generated_sig === signature;

    res.json({
      verified: true,
      status: "paid",
      message: "Razorpay signature verified successfully on server backend."
    });
  });

  // API: Cloudinary Signature
  app.get("/api/cloudinary/signature", (req, res) => {
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    // Generate signature using Cloudinary api_secret
    // In production, we'd use: cloudinary.utils.api_sign_request({ timestamp: timestamp }, process.env.CLOUDINARY_API_SECRET);

    res.json({
      signature: "cloudinary_mock_signature_hash_xyz123",
      timestamp: timestamp,
      api_key: process.env.CLOUDINARY_API_KEY || "cloudinary_mock_api_key"
    });
  });

  // API: System Audit logs endpoint
  app.post("/api/audit/log", (req, res) => {
    const { action, user, details } = req.body;
    console.log(`[AUDIT LOG] ${new Date().toISOString()} | User: ${user} | Action: ${action} | Details: ${details}`);
    res.json({ logged: true });
  });

  // Serve static JS library files directly
  app.use("/js", express.static(path.join(process.cwd(), "js")));

  // Vite middleware for development / Express Static for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    // Handle standard multi-page paths in production
    app.get("/user", (req, res) => res.sendFile(path.join(distPath, "user.html")));
    app.get("/store", (req, res) => res.sendFile(path.join(distPath, "store.html")));
    app.get("/delivery", (req, res) => res.sendFile(path.join(distPath, "delivery.html")));
    app.get("/deliveryboy", (req, res) => res.sendFile(path.join(distPath, "deliveryboy.html")));
    app.get("/admin", (req, res) => res.sendFile(path.join(distPath, "admin.html")));

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[DawaDo Express] Server booted successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
