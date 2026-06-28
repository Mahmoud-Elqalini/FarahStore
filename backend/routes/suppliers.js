const router = require("express").Router();
const db = require("../config/db");

// GET /api/suppliers — Get all suppliers
router.get("/", (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE is_active = 1';

    const result = db.prepare(
      `SELECT * FROM suppliers ${whereClause} ORDER BY supplier_id`
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

// GET /api/suppliers/:id — Get single supplier
router.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE supplier_id = ?").get(id);
    
    if (!supplier) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found" });
    }
    
    supplier.is_active = supplier.is_active === 1;
    res.json(supplier);
  } catch (err) {
    next(err);
  }
});

// POST /api/suppliers — Create new supplier
router.post("/", (req, res, next) => {
  try {
    const { supplier_name, phone, address, notes } = req.body;

    if (!supplier_name || !supplier_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "supplier_name is required" });
    }

    if (phone && phone.trim() && !/^01\d{9}$/.test(phone.trim())) {
      return res.status(400).json({ error_code: "INVALID_PHONE", error_ar: "رقم التليفون يجب أن يتكون من 11 رقم ويبدأ بـ 01", error: "Invalid phone number format" });
    }

    const info = db.prepare(
      "INSERT INTO suppliers (supplier_name, phone, address, notes) VALUES (?, ?, ?, ?)"
    ).run(supplier_name.trim(), phone, address, notes);
    
    const newSupplier = db.prepare("SELECT * FROM suppliers WHERE supplier_id = ?").get(info.lastInsertRowid);
    newSupplier.is_active = newSupplier.is_active === 1;
    
    res.status(201).json({ message: "Supplier created successfully", data: newSupplier });
  } catch (err) {
    next(err);
  }
});

// PUT /api/suppliers/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Supplier ID is required" });
});

// PUT /api/suppliers/:id — Update supplier
router.put("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const { supplier_name, phone, address, notes } = req.body;

    if (!supplier_name || !supplier_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "supplier_name is required" });
    }

    if (phone && phone.trim() && !/^01\d{9}$/.test(phone.trim())) {
      return res.status(400).json({ error_code: "INVALID_PHONE", error_ar: "رقم التليفون يجب أن يتكون من 11 رقم ويبدأ بـ 01", error: "Invalid phone number format" });
    }

    const info = db.prepare(
      "UPDATE suppliers SET supplier_name = ?, phone = ?, address = ?, notes = ? WHERE supplier_id = ?"
    ).run(supplier_name.trim(), phone, address, notes, id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found" });
    }
    
    const updatedSupplier = db.prepare("SELECT * FROM suppliers WHERE supplier_id = ?").get(id);
    updatedSupplier.is_active = updatedSupplier.is_active === 1;
    
    res.json({ message: "Supplier updated successfully", data: updatedSupplier });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/suppliers/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Supplier ID is required" });
});

// DELETE /api/suppliers/:id — Deactivate supplier (Soft Delete)
router.delete("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // Business Rule: Cannot deactivate supplier if it has ACTIVE products
    const checkActiveProducts = db.prepare(
      "SELECT 1 FROM products WHERE supplier_id = ? AND is_active = 1 LIMIT 1"
    ).get(id);
    
    if (checkActiveProducts) {
      return res.status(409).json({ 
        error_code: "SUPPLIER_IN_USE", 
        error: "Cannot deactivate a supplier that has active products." 
      });
    }

    const info = db.prepare("UPDATE suppliers SET is_active = 0 WHERE supplier_id = ? AND is_active = 1").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found or already inactive" });
    }
    
    const supplier = db.prepare("SELECT * FROM suppliers WHERE supplier_id = ?").get(id);
    supplier.is_active = supplier.is_active === 1;
    
    res.json({ message: "Supplier deactivated successfully", data: supplier });
  } catch (err) {
    next(err);
  }
});

// PUT /api/suppliers/:id/activate — Reactivate supplier
router.put("/:id/activate", (req, res, next) => {
  try {
    const { id } = req.params;
    const info = db.prepare("UPDATE suppliers SET is_active = 1 WHERE supplier_id = ? AND is_active = 0").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Supplier not found or already active" });
    }
    
    const supplier = db.prepare("SELECT * FROM suppliers WHERE supplier_id = ?").get(id);
    supplier.is_active = supplier.is_active === 1;
    
    res.json({ message: "Supplier activated successfully", data: supplier });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
