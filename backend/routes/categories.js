const router = require("express").Router();
const pool = require("../config/db");

// GET /api/categories — Get all categories with product count
router.get("/", async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE c.is_active = TRUE';

    const result = await pool.query(
      `SELECT c.category_id, c.category_name, c.is_active, COUNT(p.product_id)::int AS product_count
       FROM categories c
       LEFT JOIN products p ON c.category_id = p.category_id
       ${whereClause}
       GROUP BY c.category_id, c.category_name, c.is_active
       ORDER BY c.category_id`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/:id — Get single category
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM categories WHERE category_id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories — Create new category
router.post("/", async (req, res, next) => {
  try {
    const { category_name } = req.body;

    // Validation — category_name is required
    if (!category_name || !category_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "category_name is required" });
    }

    const result = await pool.query(
      "INSERT INTO categories (category_name) VALUES ($1) RETURNING *",
      [category_name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Category ID is required" });
});

// PUT /api/categories/:id — Update category
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category_name } = req.body;

    // Validation — category_name is required
    if (!category_name || !category_name.trim()) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "category_name is required" });
    }

    const result = await pool.query(
      "UPDATE categories SET category_name = $1 WHERE category_id = $2 RETURNING *",
      [category_name.trim(), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Category ID is required" });
});

// DELETE /api/categories/:id — Deactivate category (Soft Delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Business Rule: Cannot deactivate category if it has ACTIVE products
    const checkActiveProducts = await pool.query(
      "SELECT 1 FROM products WHERE category_id = $1 AND is_active = TRUE LIMIT 1",
      [id]
    );
    
    if (checkActiveProducts.rows.length > 0) {
      return res.status(409).json({ 
        error_code: "CATEGORY_IN_USE", 
        error: "Cannot deactivate a category that contains active products." 
      });
    }

    // Perform Soft Delete
    const result = await pool.query(
      "UPDATE categories SET is_active = FALSE WHERE category_id = $1 AND is_active = TRUE RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found or already inactive" });
    }
    res.json({ message: "Category deactivated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/:id/activate — Reactivate category
router.put("/:id/activate", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE categories SET is_active = TRUE WHERE category_id = $1 AND is_active = FALSE RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Category not found or already active" });
    }
    res.json({ message: "Category activated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
