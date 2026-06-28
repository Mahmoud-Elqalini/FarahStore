const router = require("express").Router();
const db = require("../config/db");

// GET /api/categories — Get all categories with product count
router.get("/", (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE c.is_active = 1';

    const result = db.prepare(
      `SELECT c.category_id, c.category_name, c.is_active, CAST(COUNT(p.product_id) AS INTEGER) AS product_count
       FROM categories c
       LEFT JOIN products p ON c.category_id = p.category_id
       ${whereClause}
       GROUP BY c.category_id, c.category_name, c.is_active
       ORDER BY c.category_id`
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

// GET /api/categories/:id — Get single category
router.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const category = db.prepare("SELECT * FROM categories WHERE category_id = ?").get(id);
    
    if (!category) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found" });
    }
    
    category.is_active = category.is_active === 1;
    res.json(category);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories — Create new category
router.post("/", (req, res, next) => {
  try {
    const { category_name } = req.body;

    // Validation — category_name is required
    if (!category_name || !category_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "category_name is required" });
    }

    const info = db.prepare("INSERT INTO categories (category_name) VALUES (?)").run(category_name.trim());
    const newCategory = db.prepare("SELECT * FROM categories WHERE category_id = ?").get(info.lastInsertRowid);
    
    newCategory.is_active = newCategory.is_active === 1;
    res.status(201).json(newCategory);
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Category ID is required" });
});

// PUT /api/categories/:id — Update category
router.put("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const { category_name } = req.body;

    // Validation — category_name is required
    if (!category_name || !category_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "category_name is required" });
    }

    const info = db.prepare("UPDATE categories SET category_name = ? WHERE category_id = ?").run(category_name.trim(), id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found" });
    }
    
    const updatedCategory = db.prepare("SELECT * FROM categories WHERE category_id = ?").get(id);
    updatedCategory.is_active = updatedCategory.is_active === 1;
    res.json(updatedCategory);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Category ID is required" });
});

// DELETE /api/categories/:id — Deactivate category (Soft Delete)
router.delete("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // Business Rule: Cannot deactivate category if it has ACTIVE products
    const checkActiveProducts = db.prepare("SELECT 1 FROM products WHERE category_id = ? AND is_active = 1 LIMIT 1").get(id);
    
    if (checkActiveProducts) {
      return res.status(409).json({ 
        error_code: "CATEGORY_IN_USE", 
        error: "Cannot deactivate a category that contains active products." 
      });
    }

    // Perform Soft Delete
    const info = db.prepare("UPDATE categories SET is_active = 0 WHERE category_id = ? AND is_active = 1").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found or already inactive" });
    }
    
    const category = db.prepare("SELECT * FROM categories WHERE category_id = ?").get(id);
    category.is_active = category.is_active === 1;
    res.json({ message: "Category deactivated successfully", data: category });
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/:id/activate — Reactivate category
router.put("/:id/activate", (req, res, next) => {
  try {
    const { id } = req.params;
    const info = db.prepare("UPDATE categories SET is_active = 1 WHERE category_id = ? AND is_active = 0").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found or already active" });
    }
    
    const category = db.prepare("SELECT * FROM categories WHERE category_id = ?").get(id);
    category.is_active = category.is_active === 1;
    res.json({ message: "Category activated successfully", data: category });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
