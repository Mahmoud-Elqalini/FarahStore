const router = require("express").Router();
const pool = require("../config/db");

// GET /api/suppliers — Get all suppliers
router.get("/", async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';

    const result = await pool.query(
      `SELECT * FROM suppliers ${whereClause} ORDER BY supplier_id`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/suppliers/:id — Get single supplier
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM suppliers WHERE supplier_id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers — Create new supplier
router.post("/", async (req, res, next) => {
  try {
    const { supplier_name, phone, address, notes } = req.body;

    if (!supplier_name || !supplier_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "supplier_name is required" });
    }

    const result = await pool.query(
      "INSERT INTO suppliers (supplier_name, phone, address, notes) VALUES ($1, $2, $3, $4) RETURNING *",
      [supplier_name.trim(), phone, address, notes]
    );
    res.status(201).json({ message: "Supplier created successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/suppliers/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Supplier ID is required" });
});

// PUT /api/suppliers/:id — Update supplier
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supplier_name, phone, address, notes } = req.body;

    if (!supplier_name || !supplier_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "supplier_name is required" });
    }

    const result = await pool.query(
      "UPDATE suppliers SET supplier_name = $1, phone = $2, address = $3, notes = $4 WHERE supplier_id = $5 RETURNING *",
      [supplier_name.trim(), phone, address, notes, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found" });
    }
    res.json({ message: "Supplier updated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/suppliers/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Supplier ID is required" });
});

// DELETE /api/suppliers/:id — Deactivate supplier (Soft Delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Business Rule: Cannot deactivate supplier if it has ACTIVE products
    const checkActiveProducts = await pool.query(
      "SELECT 1 FROM products WHERE supplier_id = $1 AND is_active = TRUE LIMIT 1",
      [id]
    );
    
    if (checkActiveProducts.rows.length > 0) {
      return res.status(409).json({ 
        error_code: "SUPPLIER_IN_USE", 
        error: "Cannot deactivate a supplier that has active products." 
      });
    }

    const result = await pool.query(
      "UPDATE suppliers SET is_active = FALSE WHERE supplier_id = $1 AND is_active = TRUE RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found or already inactive" });
    }
    res.json({ message: "Supplier deactivated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/suppliers/:id/activate — Reactivate supplier
router.put("/:id/activate", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE suppliers SET is_active = TRUE WHERE supplier_id = $1 AND is_active = FALSE RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found or already active" });
    }
    res.json({ message: "Supplier activated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
