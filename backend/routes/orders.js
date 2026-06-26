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

    // Calculate remaining_balance
    if (orderData.payment_type === 'Cash') {
      orderData.remaining_balance = 0;
    } else {
      const remainingQuery = `
        SELECT COALESCE(SUM(amount), 0) as remaining_balance
        FROM installments
        WHERE order_id = $1 AND status IN ('Pending', 'Late')
      `;
      const remainingResult = await pool.query(remainingQuery, [id]);
      orderData.remaining_balance = Number(remainingResult.rows[0].remaining_balance);
    }

    res.json(orderData);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — Create new order
router.post("/", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_id, payment_type, items, months, first_due_date } = req.body;

    // 1. Basic Validations
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error_ar: "السلة فارغة، أضف منتجاً واحداً على الأقل", error: "Items array is empty" });
    }
    if (payment_type !== "Cash" && payment_type !== "Installment") {
      return res.status(400).json({ error_code: "INVALID_PAYMENT_TYPE", error_ar: "نوع الدفع غير صحيح", error: "Invalid payment type" });
    }
    if (!customer_id) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error_ar: "العميل مطلوب", error: "Customer ID is required" });
    }
    if (payment_type === "Installment") {
      if (!months || months < 1) {
        return res.status(400).json({ error_code: "INVALID_INSTALLMENT_DATA", error_ar: "بيانات التقسيط غير صحيحة", error: "Invalid months" });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!first_due_date || new Date(first_due_date) < today) {
        return res.status(400).json({ error_code: "INVALID_INSTALLMENT_DATA", error_ar: "بيانات التقسيط غير صحيحة", error: "Invalid first_due_date" });
      }
    }

    for (let i = 0; i < items.length; i++) {
      if (!items[i].product_id || items[i].quantity === undefined || items[i].quantity <= 0 || !Number.isInteger(items[i].quantity)) {
        return res.status(400).json({ error_code: "VALIDATION_ERROR", error_ar: "بيانات المنتجات غير صحيحة", error: `Invalid item at index ${i}` });
      }
    }

    // 2. Validate Customer
    const custRes = await client.query('SELECT is_active FROM customers WHERE customer_id = $1', [customer_id]);
    if (custRes.rowCount === 0 || !custRes.rows[0].is_active) {
      return res.status(400).json({ error_code: "NOT_FOUND", error_ar: "العميل غير موجود أو محذوف", error: "Customer not found or inactive" });
    }

    // 3. Fetch Prices & Validate Products
    let total_amount = 0;
    const finalItems = [];

    for (const item of items) {
      const prodRes = await client.query('SELECT product_name, selling_price, is_active FROM products WHERE product_id = $1', [item.product_id]);
      if (prodRes.rowCount === 0 || !prodRes.rows[0].is_active) {
        return res.status(400).json({ error_code: "NOT_FOUND", error_ar: "المنتج غير موجود أو محذوف", error: `Product ${item.product_id} not found or inactive` });
      }
      const price = Number(prodRes.rows[0].selling_price);
      total_amount += price * item.quantity;
      finalItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: price // Needed by create_order DB function
      });
    }

    const itemsJsonb = JSON.stringify(finalItems);

    // 4. Transaction
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT create_order($1, $2, $3, $4::jsonb) AS order_id`,
      [customer_id, payment_type, total_amount, itemsJsonb]
    );
    const order_id = orderRes.rows[0].order_id;

    if (payment_type === "Installment") {
      await client.query(
        `SELECT generate_installments($1, $2, $3)`,
        [order_id, months, first_due_date]
      );
    }

    await client.query('COMMIT');

    // 5. Success Response
    const paid_amount = payment_type === 'Cash' ? total_amount : 0;
    const remaining_balance = payment_type === 'Installment' ? total_amount : 0;

    res.status(201).json({
      success: true,
      order_id,
      invoice_number: `ORD-${order_id}`,
      created_at: new Date().toISOString(),
      total_amount,
      payment_type,
      paid_amount,
      remaining_balance,
      message: "تم إنشاء الفاتورة بنجاح"
    });

  } catch (err) {
    await client.query('ROLLBACK');
    // Check if error is from Postgres RAISE EXCEPTION for stock
    if (err.message && err.message.includes('Insufficient stock for product')) {
      const match = err.message.match(/product\s+(\d+)/i);
      const productId = match ? match[1] : null;
      if (!productId) {
        return res.status(400).json({ error_code: "INSUFFICIENT_STOCK", error_ar: "المخزون لا يكفي لبعض المنتجات", error: err.message });
      }
      try {
        const pRes = await pool.query('SELECT product_name, stock_quantity FROM products WHERE product_id = $1', [productId]);
        if (pRes.rowCount > 0) {
          const prodName = pRes.rows[0].product_name;
          return res.status(400).json({
            error_code: "INSUFFICIENT_STOCK",
            error_ar: `المنتج '${prodName}' متاح بكمية ${pRes.rows[0].stock_quantity} فقط`,
            error: err.message
          });
        }
      } catch (e) {
        // Ignore fallback query error
      }
      
      return res.status(400).json({
        error_code: "INSUFFICIENT_STOCK",
        error_ar: `المخزون لا يكفي للمنتج رقم ${productId}`,
        error: err.message
      });
    }
    next(err);
  } finally {
    client.release();
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
    if (body.total_amount !== undefined) {
      return res.status(400).json({ error_code: "INVALID_FIELD", error_ar: "لا يمكن تعديل الإجمالي", error: "total_amount cannot be updated via PUT" });
    }
    if (body.payment_type !== undefined) {
      return res.status(400).json({ error_code: "INVALID_FIELD", error_ar: "لا يمكن تعديل نوع الدفع بعد إنشاء الطلب", error: "payment_type cannot be updated via PUT" });
    }
    const customer_id = body.customer_id !== undefined ? body.customer_id : existing.customer_id;
    const payment_type = existing.payment_type;
    const total_amount = existing.total_amount;

    // 3. Validations on merged data
    if (payment_type !== "Cash" && payment_type !== "Installment") {
      return res.status(400).json({ error_code: "INVALID_PAYMENT_TYPE", error: "payment_type must be either 'Cash' or 'Installment'" });
    }
    if (total_amount <= 0) {
      return res.status(400).json({ error_code: "ZERO_OR_NEGATIVE_AMOUNT", error: "total_amount must be greater than zero" });
    }

    // 4. Update Database
    const result = await pool.query(
      `UPDATE orders SET customer_id = $1 WHERE order_id = $2 RETURNING *`,
      [customer_id, id]
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
    
    const checkResult = await pool.query("SELECT order_status FROM orders WHERE order_id = $1", [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Order not found" });
    }
    if (checkResult.rows[0].order_status === 'Cancelled') {
      return res.status(400).json({ error_code: "ALREADY_CANCELLED", error_ar: "الطلب ملغي بالفعل", error: "Order is already cancelled" });
    }

    const result = await pool.query(
      "UPDATE orders SET order_status = 'Cancelled' WHERE order_id = $1 RETURNING *",
      [id]
    );
    res.json({ message: "تم إلغاء الطلب بنجاح", data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
