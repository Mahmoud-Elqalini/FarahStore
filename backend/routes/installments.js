const router = require("express").Router();
const pool = require("../config/db");

// GET /api/installments — Get all installments
router.get("/", async (req, res, next) => {
  try {
    const query = `
      SELECT i.*, o.customer_id, c.customer_name 
      FROM installments i
      LEFT JOIN orders o ON i.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      ORDER BY i.due_date ASC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/installments/order/:order_id — Get all installments for a specific order
router.get("/order/:order_id", async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const query = `
      SELECT i.*, o.customer_id, c.customer_name 
      FROM installments i
      LEFT JOIN orders o ON i.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE i.order_id = $1
      ORDER BY i.due_date ASC
    `;
    const result = await pool.query(query, [order_id]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/installments/:id — Get single installment
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT i.*, o.customer_id, c.customer_name 
      FROM installments i
      LEFT JOIN orders o ON i.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE i.installment_id = $1
    `;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Installment not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/installments — Generate installments for an order
router.post("/", async (req, res, next) => {
  try {
    const { p_order_id, p_months, p_first_due_date } = req.body;

    // Validations
    if (!p_order_id) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "p_order_id is required" });
    }
    if (p_months === undefined || p_months <= 0) {
      return res.status(400).json({ error_code: "ZERO_OR_NEGATIVE_AMOUNT", error: "p_months must be greater than zero" });
    }
    if (!p_first_due_date) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "p_first_due_date is required" });
    }

    const result = await pool.query(
      `SELECT * FROM generate_installments($1, $2, $3)`,
      [p_order_id, p_months, p_first_due_date]
    );

    res.status(201).json({ message: "Installments generated successfully" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/installments/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Installment ID is required" });
});

// PUT /api/installments/:id — Update installment (Partial Update)
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch existing installment
    const checkResult = await pool.query("SELECT * FROM installments WHERE installment_id = $1", [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Installment not found" });
    }
    const existing = checkResult.rows[0];

    // 2. Merge existing data with new data
    const { body } = req;
    const amount = body.amount !== undefined ? body.amount : existing.amount;
    const due_date = body.due_date !== undefined ? body.due_date : existing.due_date;
    const payment_date = body.payment_date !== undefined ? body.payment_date : existing.payment_date;
    const status = body.status !== undefined ? body.status : existing.status;

    // 3. Validations on merged data
    if (amount <= 0) {
      return res.status(400).json({ error_code: "ZERO_OR_NEGATIVE_AMOUNT", error: "amount must be greater than zero" });
    }

    if (status !== 'Pending' && status !== 'Paid' && status !== 'Late') {
      return res.status(400).json({ error_code: "INVALID_STATUS", error: "status must be 'Pending', 'Paid', or 'Late'" });
    }

    // [Business Logic Guard] Prevent payment_date contradiction
    let final_payment_date = payment_date;
    if (status !== 'Paid') {
      final_payment_date = null;
    }

    // 4. Update Database
    const result = await pool.query(
      `UPDATE installments 
       SET amount = $1, due_date = $2, payment_date = $3, status = $4
       WHERE installment_id = $5 RETURNING *`,
      [amount, due_date, final_payment_date, status, id]
    );

    res.json({ message: "Installment updated successfully", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/installments/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Installment ID is required" });
});

// DELETE /api/installments/:id — Delete installment
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM installments WHERE installment_id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Installment not found" });
    }
    res.json({ message: "Installment deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
