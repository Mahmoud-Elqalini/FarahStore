const router = require("express").Router();
const db = require("../config/db");

// GET /api/customers — Get all customers
router.get("/", (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE is_active = 1';

    const result = db.prepare(
      `SELECT * FROM customers ${whereClause} ORDER BY customer_id`
    ).all();
    
    const formattedResult = result.map(r => ({
      ...r,
      is_active: r.is_active === 1
    }));
    
    res.json(formattedResult);
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id — Get single customer
router.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const customer = db.prepare("SELECT * FROM customers WHERE customer_id = ?").get(id);
    
    if (!customer) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found" });
    }
    
    customer.is_active = customer.is_active === 1;
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// POST /api/customers — Create new customer
router.post("/", (req, res, next) => {
  try {
    const { customer_name, phone, address, notes } = req.body;
    
    if (!customer_name || !customer_name.trim() || !phone || !phone.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "customer_name and phone are required" });
    }

    if (!/^01\d{9}$/.test(phone.trim())) {
      return res.status(400).json({ error_code: "INVALID_PHONE", error_ar: "رقم التليفون يجب أن يتكون من 11 رقم ويبدأ بـ 01", error: "Invalid phone number format" });
    }

    const info = db.prepare(
      "INSERT INTO customers (customer_name, phone, address, notes) VALUES (?, ?, ?, ?)"
    ).run(customer_name.trim(), phone.trim(), address, notes);
    
    const newCustomer = db.prepare("SELECT * FROM customers WHERE customer_id = ?").get(info.lastInsertRowid);
    newCustomer.is_active = newCustomer.is_active === 1;
    
    res.status(201).json({ message: "Customer created successfully", data: newCustomer });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Customer ID is required" });
});

// PUT /api/customers/:id — Update customer
router.put("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const { customer_name, phone, address, notes } = req.body;

    if (!customer_name || !customer_name.trim() || !phone || !phone.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "customer_name and phone are required" });
    }

    if (!/^01\d{9}$/.test(phone.trim())) {
      return res.status(400).json({ error_code: "INVALID_PHONE", error_ar: "رقم التليفون يجب أن يتكون من 11 رقم ويبدأ بـ 01", error: "Invalid phone number format" });
    }

    const info = db.prepare(
      "UPDATE customers SET customer_name = ?, phone = ?, address = ?, notes = ? WHERE customer_id = ?"
    ).run(customer_name.trim(), phone.trim(), address, notes, id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found" });
    }
    
    const updatedCustomer = db.prepare("SELECT * FROM customers WHERE customer_id = ?").get(id);
    updatedCustomer.is_active = updatedCustomer.is_active === 1;
    
    res.json({ message: "Customer updated successfully", data: updatedCustomer });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Customer ID is required" });
});

// DELETE /api/customers/:id — Deactivate customer (Soft Delete)
router.delete("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // Business Rule: Cannot deactivate customer if they have active orders or unpaid installments
    const checkActiveOrders = db.prepare(
      "SELECT 1 FROM orders WHERE customer_id = ? AND order_status = 'Active' LIMIT 1"
    ).get(id);
    
    if (checkActiveOrders) {
      return res.status(409).json({ 
        error_code: "CUSTOMER_HAS_OBLIGATIONS", 
        error: "لا يمكن تعطيل هذا العميل لوجود طلبات مفتوحة." 
      });
    }

    // Check unpaid installments
    const checkUnpaidInstallments = db.prepare(
      `SELECT 1 FROM installments i 
       JOIN orders o ON i.order_id = o.order_id 
       WHERE o.customer_id = ? AND i.status != 'Paid' LIMIT 1`
    ).get(id);

    if (checkUnpaidInstallments) {
      return res.status(409).json({ 
        error_code: "CUSTOMER_HAS_OBLIGATIONS", 
        error: "لا يمكن تعطيل هذا العميل لوجود أقساط غير مسددة." 
      });
    }

    const info = db.prepare("UPDATE customers SET is_active = 0 WHERE customer_id = ? AND is_active = 1").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found or already inactive" });
    }
    
    const customer = db.prepare("SELECT * FROM customers WHERE customer_id = ?").get(id);
    customer.is_active = customer.is_active === 1;
    
    res.json({ message: "Customer deactivated successfully", data: customer });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id/activate — Reactivate customer
router.put("/:id/activate", (req, res, next) => {
  try {
    const { id } = req.params;
    const info = db.prepare("UPDATE customers SET is_active = 1 WHERE customer_id = ? AND is_active = 0").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found or already active" });
    }
    
    const customer = db.prepare("SELECT * FROM customers WHERE customer_id = ?").get(id);
    customer.is_active = customer.is_active === 1;
    
    res.json({ message: "Customer activated successfully", data: customer });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
