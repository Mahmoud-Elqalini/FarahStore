const router = require("express").Router();
const pool = require("../config/db");

// GET /api/orders — Get all orders
router.get("/", async (req, res, next) => {
  try {
    const query = `
      SELECT o.*, c.customer_name 
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      ORDER BY o.order_id DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — Get single order with details
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get Order Info
    const orderQuery = `
      SELECT o.*, c.customer_name 
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE o.order_id = $1
    `;
    const orderResult = await pool.query(orderQuery, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Order not found" });
    }

    // Get Order Details
    const detailsQuery = `
      SELECT od.*, p.product_name 
      FROM order_details od
      LEFT JOIN products p ON od.product_id = p.product_id
      WHERE od.order_id = $1
    `;
    const detailsResult = await pool.query(detailsQuery, [id]);

    const orderData = orderResult.rows[0];
    orderData.items = detailsResult.rows;

    res.json(orderData);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — Create new order
router.post("/", async (req, res, next) => {
  try {
    const { p_customer_id, p_payment_type, p_total_amount, p_items } = req.body;

    // Validations
    if (!p_customer_id) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "p_customer_id is required" });
    }
    if (!p_payment_type) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "p_payment_type is required" });
    }
    if (p_total_amount === undefined) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "p_total_amount is required" });
    }
    if (!p_items) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "p_items is required" });
    }

    if (p_payment_type !== "Cash" && p_payment_type !== "Installment") {
      return res.status(400).json({ error_code: "INVALID_PAYMENT_TYPE", error: "p_payment_type must be either 'Cash' or 'Installment'" });
    }

    if (p_total_amount <= 0) {
      return res.status(400).json({ error_code: "ZERO_OR_NEGATIVE_AMOUNT", error: "p_total_amount must be greater than zero" });
    }

    if (!Array.isArray(p_items) || p_items.length === 0) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "p_items must be a non-empty array" });
    }

    for (let i = 0; i < p_items.length; i++) {
      const item = p_items[i];
      if (!item.product_id) {
        return res.status(400).json({
          error_code: "REQUIRED_FIELDS",
          error: `Item at index ${i} is missing product_id`,
          error_ar: `الصنف رقم ${i + 1} يفتقد لمعرف المنتج`
        });
      }
      if (item.quantity === undefined || item.quantity <= 0) {
        return res.status(400).json({
          error_code: "ZERO_OR_NEGATIVE_AMOUNT",
          error: `Item at index ${i} must have quantity greater than 0`,
          error_ar: `الصنف رقم ${i + 1} يجب أن تكون كميته أكبر من صفر`
        });
      }
      if (item.unit_price === undefined || item.unit_price <= 0) {
        return res.status(400).json({
          error_code: "ZERO_OR_NEGATIVE_AMOUNT",
          error: `Item at index ${i} must have unit_price greater than 0`,
          error_ar: `الصنف رقم ${i + 1} يجب أن يكون سعر وحدته أكبر من صفر`
        });
      }
    }

    // Convert p_items to JSON string for PostgreSQL JSONB
    const itemsJson = JSON.stringify(p_items);

    const result = await pool.query(
      `SELECT * FROM create_order($1, $2, $3, $4::jsonb)`,
      [p_customer_id, p_payment_type, p_total_amount, itemsJson]
    );

    res.status(201).json({ message: "Order created successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/orders/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Order ID is required" });
});

// PUT /api/orders/:id — Update order (Partial Update)
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch existing order
    const checkResult = await pool.query("SELECT * FROM orders WHERE order_id = $1", [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Order not found" });
    }
    const existing = checkResult.rows[0];

    // 2. Merge existing data with new data
    const { body } = req;
    const customer_id = body.customer_id !== undefined ? body.customer_id : existing.customer_id;
    const payment_type = body.payment_type !== undefined ? body.payment_type : existing.payment_type;
    const total_amount = body.total_amount !== undefined ? body.total_amount : existing.total_amount;

    // 3. Validations on merged data
    if (payment_type !== "Cash" && payment_type !== "Installment") {
      return res.status(400).json({ error_code: "INVALID_PAYMENT_TYPE", error: "payment_type must be either 'Cash' or 'Installment'" });
    }
    if (total_amount <= 0) {
      return res.status(400).json({ error_code: "ZERO_OR_NEGATIVE_AMOUNT", error: "total_amount must be greater than zero" });
    }

    // 4. Update Database
    const result = await pool.query(
      `UPDATE orders 
       SET customer_id = $1, payment_type = $2, total_amount = $3 
       WHERE order_id = $4 RETURNING *`,
      [customer_id, payment_type, total_amount, id]
    );

    res.json({ message: "Order updated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orders/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Order ID is required" });
});

// DELETE /api/orders/:id — Delete order
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM orders WHERE order_id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Order not found" });
    }
    res.json({ message: "Order deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
