const router = require("express").Router();
const pool = require("../config/db");

// GET /api/customers — Get all customers
router.get("/", async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';

    const result = await pool.query(
      `SELECT * FROM customers ${whereClause} ORDER BY customer_id`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id — Get single customer
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM customers WHERE customer_id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/customers — Create new customer
router.post("/", async (req, res, next) => {
  try {
    const { customer_name, phone, address, notes } = req.body;
    
    if (!customer_name || !customer_name.trim() || !phone || !phone.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "customer_name and phone are required" });
    }

    const result = await pool.query(
      "INSERT INTO customers (customer_name, phone, address, notes) VALUES ($1, $2, $3, $4) RETURNING *",
      [customer_name.trim(), phone.trim(), address, notes]
    );
    res.status(201).json({ message: "Customer created successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Customer ID is required" });
});

// PUT /api/customers/:id — Update customer
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { customer_name, phone, address, notes } = req.body;

    if (!customer_name || !customer_name.trim() || !phone || !phone.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "customer_name and phone are required" });
    }

    const result = await pool.query(
      "UPDATE customers SET customer_name = $1, phone = $2, address = $3, notes = $4 WHERE customer_id = $5 RETURNING *",
      [customer_name.trim(), phone.trim(), address, notes, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found" });
    }
    res.json({ message: "Customer updated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Customer ID is required" });
});

// DELETE /api/customers/:id — Deactivate customer (Soft Delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Business Rule: Cannot deactivate customer if they have active orders or unpaid installments
    const checkActiveOrders = await pool.query(
      "SELECT 1 FROM orders WHERE customer_id = $1 AND order_status = 'Active' LIMIT 1",
      [id]
    );
    
    if (checkActiveOrders.rows.length > 0) {
      return res.status(409).json({ 
        error_code: "CUSTOMER_HAS_OBLIGATIONS", 
        error: "لا يمكن تعطيل هذا العميل لوجود طلبات مفتوحة." 
      });
    }

    // Check unpaid installments
    const checkUnpaidInstallments = await pool.query(
      `SELECT 1 FROM installments i 
       JOIN orders o ON i.order_id = o.order_id 
       WHERE o.customer_id = $1 AND i.status != 'Paid' LIMIT 1`,
      [id]
    );

    if (checkUnpaidInstallments.rows.length > 0) {
      return res.status(409).json({ 
        error_code: "CUSTOMER_HAS_OBLIGATIONS", 
        error: "لا يمكن تعطيل هذا العميل لوجود أقساط غير مسددة." 
      });
    }

    const result = await pool.query(
      "UPDATE customers SET is_active = FALSE WHERE customer_id = $1 AND is_active = TRUE RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found or already inactive" });
    }
    res.json({ message: "Customer deactivated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id/activate — Reactivate customer
router.put("/:id/activate", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE customers SET is_active = TRUE WHERE customer_id = $1 AND is_active = FALSE RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Customer not found or already active" });
    }
    res.json({ message: "Customer activated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
