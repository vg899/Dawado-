# DawaDo Platform Security Specification

This document details the Zero-Trust security rules validation criteria, relational data invariants, defensive payloads, and test conditions for the DawaDo – Your Medicine Partner ecosystem.

## 1. Data Invariants

1. **User Profiling Boundary**: Users can read and write only their own profiles (`/users/{userId}`). Accessing another user's profile is strictly denied.
2. **Pharmacy Sovereignty**: Stores can only access and update their own business information (`/stores/{storeId}`).
3. **Rider Access Isolation**: Delivery riders can only update their own status, live location, and assigned order logistics.
4. **Order Status Lifecycle Validation**: Order updates must follow sequential state transitions (`pending` -> `accepted` -> `preparing` -> `dispatched` -> `picked_up` -> `delivered` / `cancelled`). Self-transition into a finished status is heavily restricted.
5. **No Double Settlements**: Cash settlement amounts must match the exact Razorpay transaction hash verified by the system.
6. **Immutable Historical Audit Logging**: Audit log documents can only be appended (`create` allowed for admins/system, never updated or deleted).
7. **Identity Verification & Email Security**: Email strings cannot be spoofed to match Admin permissions without verified authentication.
8. **Path ID Integrity**: Document path variable IDs are limited to 128 characters and restricted to safe alphanumeric characters `^[a-zA-Z0-9_\-]+$`.

---

## 2. The "Dirty Dozen" Threat Payloads

These 12 malicious payloads represent attempts to compromise platform integrity, which the Firestore rules will block with `PERMISSION_DENIED`.

### Payload 1: Privilege Escalation on User Profile
* **Target Path**: `/users/attacker_uid`
* **Vulnerability Attempted**: Attackers setting their account as an admin or store owner.
* **Payload**:
```json
{
  "id": "attacker_uid",
  "name": "Attacker",
  "email": "attacker@scam.com",
  "phone": "+91 99999 99999",
  "role": "SuperAdmin",
  "isAdmin": true
}
```

### Payload 2: ID Poisoning Attack
* **Target Path**: `/users/MALICIOUS_LONG_ID_OR_INJECT_SPECIAL_CHARACTERS_$$$`
* **Vulnerability Attempted**: Denial of Service (DoS) / SQL injection-style path pollution.
* **Payload**:
```json
{
  "id": "MALICIOUS_LONG_ID_OR_INJECT_SPECIAL_CHARACTERS_$$$",
  "name": "Malicious User",
  "email": "malicious@user.com",
  "phone": "+91 12345 67890"
}
```

### Payload 3: Fraudulent Settlement Injection
* **Target Path**: `/settlements/STL-001`
* **Vulnerability Attempted**: Rider injecting an unverified settlement with a spoofed amount.
* **Payload**:
```json
{
  "id": "STL-001",
  "deliveryBoyId": "attacker_rider",
  "amount": 100000.0,
  "razorpayPaymentId": "pay_SPOOFED_MOCK_112",
  "status": "completed",
  "timestamp": "2026-07-02T22:00:00.000Z"
}
```

### Payload 4: Arbitrary Pharmacy Approvals
* **Target Path**: `/stores/unlicensed_store`
* **Vulnerability Attempted**: Unapproved store setting its `active` status to `true` to bypass KYC check.
* **Payload**:
```json
{
  "id": "unlicensed_store",
  "name": "Scam Pharmacy",
  "email": "scam@pharm.com",
  "lat": 12.9715987,
  "lng": 77.5945627,
  "active": true,
  "drugLicense": "FAKE_DL_111",
  "gst": "FAKE_GST_222"
}
```

### Payload 5: Siphoning Private PII Profiles
* **Target Path**: `/users/user_1` (Requested by user `attacker_uid`)
* **Vulnerability Attempted**: Client scraping user phone numbers and home addresses.
* **Payload**:
```json
// Query Attempt: Read user_1 profile as attacker_uid
{ "action": "GET", "target": "/users/user_1" }
```

### Payload 6: Status Shortcutting on Billed Baskets
* **Target Path**: `/orders/O-2026-001`
* **Vulnerability Attempted**: Customer setting order status directly to `delivered` without payment or dispatch.
* **Payload**:
```json
{
  "id": "O-2026-001",
  "deliveryStatus": "delivered"
}
```

### Payload 7: Double Refund / Price Tampering
* **Target Path**: `/orders/O-2026-001` (Billed at 500 INR)
* **Vulnerability Attempted**: Bypassing integrity validations to modify billing total post-placement.
* **Payload**:
```json
{
  "id": "O-2026-001",
  "totalAmount": 1.0
}
```

### Payload 8: Immutable Audit Logs Deletion
* **Target Path**: `/auditLogs/log_1`
* **Vulnerability Attempted**: Attempt to remove system tracking footprints or tamper logs.
* **Payload**:
```json
// Delete Attempt: DELETE /auditLogs/log_1
{ "action": "DELETE", "target": "/auditLogs/log_1" }
```

### Payload 9: Spoofing Client Verification
* **Target Path**: `/users/admin_spoof`
* **Vulnerability Attempted**: Circumventing standard OAuth verify checks with a spoofed unverified email credential matching admin domain names.
* **Payload**:
```json
{
  "id": "admin_spoof",
  "name": "Fake Admin",
  "email": "admin@dawado.com",
  "phone": "+91 99999 88888"
}
```

### Payload 10: Denial of Wallet Memory Explodes
* **Target Path**: `/medicines/med_1`
* **Vulnerability Attempted**: Overwriting stock description with a massive multi-megabyte text block.
* **Payload**:
```json
{
  "id": "med_1",
  "name": "Paracetamol 650mg",
  "price": 45,
  "stock": 999,
  "category": "Fever & Pain",
  "description": "REPEATED_1MB_GARBAGE_STRING_..."
}
```

### Payload 11: Wildcard Order Takeover
* **Target Path**: `/orders/O-2026-001` (Assigned to rider Ramesh)
* **Vulnerability Attempted**: Attacker rider taking over another rider's active parcel assignment.
* **Payload**:
```json
{
  "id": "O-2026-001",
  "deliveryBoyId": "attacker_rider",
  "deliveryBoyName": "Attacker Rider"
}
```

### Payload 12: Orphaned Category Generation
* **Target Path**: `/medicines/med_new`
* **Vulnerability Attempted**: Creating a medicine with an invalid category ID reference that doesn't exist in `/categories`.
* **Payload**:
```json
{
  "id": "med_new",
  "name": "Super Medicine",
  "price": 200,
  "stock": 10,
  "category": "phantom_category"
}
```

---

## 3. Security Test Runner (Declarative Verification Spec)

```typescript
// firestore.rules.test.ts
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

describe("DawaDo Fortress Security Audit", () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "still-plane-08gvj",
      firestore: {
        rules: require("fs").readFileSync("firestore.rules", "utf8"),
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("fails when an attacker attempts to escalate privilege on their profile", async () => {
    const context = testEnv.authenticatedContext("attacker_uid");
    const db = context.firestore();
    await assertFails(
      db.doc("users/attacker_uid").set({
        id: "attacker_uid",
        name: "Attacker",
        email: "attacker@scam.com",
        phone: "+91 99999 99999",
        role: "SuperAdmin"
      })
    );
  });

  it("fails when path variable verification fails (ID Poisoning)", async () => {
    const context = testEnv.authenticatedContext("attacker_uid");
    const db = context.firestore();
    await assertFails(
      db.doc("users/MALICIOUS_LONG_ID_OR_INJECT_SPECIAL_CHARACTERS_$$$").set({
        id: "MALICIOUS_LONG_ID_$$$",
        name: "Malicious User"
      })
    );
  });

  it("fails when a non-owner tries to read user profile PII", async () => {
    const context = testEnv.authenticatedContext("attacker_uid");
    const db = context.firestore();
    await assertFails(db.doc("users/user_1").get());
  });

  it("fails when customer tries to transition order status directly to delivered (state shortcutting)", async () => {
    const context = testEnv.authenticatedContext("user_1");
    const db = context.firestore();
    await assertFails(
      db.doc("orders/O-2026-001").update({
        deliveryStatus: "delivered"
      })
    );
  });

  it("fails when deleting system audit logs", async () => {
    const context = testEnv.authenticatedContext("attacker_uid");
    const db = context.firestore();
    await assertFails(db.doc("auditLogs/log_1").delete());
  });
});
```
