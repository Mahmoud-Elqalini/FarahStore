const router = require("express").Router();
const db = require("../config/db");

// GET /api/installments — Get all installments (with optional filters)
router.get("/", (req, res, next) => {
  try {
    const { order_id, status } = req.query;
    
    let query = `
      SELECT i.*, o.customer_id, c.customer_name 
      FROM installments i
      LEFT JOIN orders o ON i.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE 1=1
    `;
    const values = [];

    if (order_id) {
      query += ` AND i.order_id = ?`;
      values.push(order_id);
    }

    if (status) {
      query += ` AND i.status = ?`;
      values.push(status);
    }

    query += ` ORDER BY i.due_date ASC`;

    const result = db.prepare(query).all(...values);
    
    // Add invoice_number to response
    const rows = result.map(row => ({
      ...row,
      invoice_number: 'ORD-' + row.order_id
    }));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/installments/order/:order_id — Get all installments for a specific order
router.get("/order/:order_id", (req, res, next) => {
  try {
    const { order_id } = req.params;
    const query = `
      SELECT i.*, o.customer_id, c.customer_name 
      FROM installments i
      LEFT JOIN orders o ON i.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE i.order_id = ?
      ORDER BY i.due_date ASC
    `;
    const result = db.prepare(query).all(order_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/installments — Deprecated: Installments are now generated automatically upon order creation
router.post("/", (req, res) => {
  res.status(410).json({
    error_code: "GONE",
    error_ar: "لم يعد هذا الرابط مستخدماً، يتم إنشاء الأقساط تلقائياً مع الطلب",
    error: "This endpoint is deprecated. Installments are generated automatically upon order creation."
  });
});

// PUT /api/installments/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Installment ID is required" });
});

// DELETE /api/installments/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Installment ID is required" });
});

// PATCH /api/installments/:id/pay — Mark single installment as Paid
router.patch("/:id/pay", (req, res, next) => {
  try {
    const { id } = req.params;
    const payment_date = req.body.payment_date || new Date().toISOString().split('T')[0];

    const payInstallmentTx = db.transaction((installmentId, pDate) => {
      const existing = db.prepare("SELECT * FROM installments WHERE installment_id = ?").get(installmentId);
      
      if (!existing) {
        throw new Error("NOT_FOUND");
      }
      if (!['Pending', 'Late'].includes(existing.status)) {
        throw new Error("ALREADY_PAID");
      }

      db.prepare(`
        UPDATE installments 
        SET status = 'Paid', payment_date = ? 
        WHERE installment_id = ?
      `).run(pDate, installmentId);
      
      const updatedInstallment = db.prepare("SELECT * FROM installments WHERE installment_id = ?").get(installmentId);
      
      // Check if order is completed (replacing trg_check_order_completed)
      const pendingCount = db.prepare("SELECT COUNT(*) as count FROM installments WHERE order_id = ? AND status != 'Paid'").get(updatedInstallment.order_id);
      
      if (pendingCount.count === 0) {
          db.prepare("UPDATE orders SET order_status = 'Completed' WHERE order_id = ?").run(updatedInstallment.order_id);
      }
      
      return updatedInstallment;
    });

    try {
      const result = payInstallmentTx(id, payment_date);
      res.json({ message: "تم تسجيل الدفع بنجاح", data: result });
    } catch (txErr) {
      if (txErr.message === "NOT_FOUND") {
         return res.status(404).json({ error_code: "NOT_FOUND", error_ar: "القسط غير موجود", error: "Installment not found" });
      }
      if (txErr.message === "ALREADY_PAID") {
         return res.status(400).json({ 
          error_code: "ALREADY_PAID", 
          error_ar: "القسط مدفوع بالفعل أو في حالة غير قابلة للتعديل",
          error: "Installment cannot be paid in its current status"
        });
      }
      throw txErr;
    }
  } catch (err) {
    next(err);
  }
});


// GET /api/installments/:id — Get single installment
router.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT i.*, o.customer_id, c.customer_name 
      FROM installments i
      LEFT JOIN orders o ON i.order_id = o.order_id
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE i.installment_id = ?
    `;
    const result = db.prepare(query).get(id);

    if (!result) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Installment not found" });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/installments/:id — Update installment (Partial Update)
router.put("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch existing installment
    const existing = db.prepare("SELECT * FROM installments WHERE installment_id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Installment not found" });
    }

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
    const updateTx = db.transaction((updateData) => {
       db.prepare(`
         UPDATE installments 
         SET amount = ?, due_date = ?, payment_date = ?, status = ?
         WHERE installment_id = ?
       `).run(updateData.amount, updateData.due_date, updateData.final_payment_date, updateData.status, id);
       
       // Trigger logic again just in case someone marks it paid manually through PUT instead of PATCH
       const pendingCount = db.prepare("SELECT COUNT(*) as count FROM installments WHERE order_id = ? AND status != 'Paid'").get(existing.order_id);
      
       if (pendingCount.count === 0) {
           db.prepare("UPDATE orders SET order_status = 'Completed' WHERE order_id = ?").run(existing.order_id);
       } else if (existing.status === 'Paid' && status !== 'Paid') {
           db.prepare("UPDATE orders SET order_status = 'Active' WHERE order_id = ?").run(existing.order_id);
       }
    });
    
    updateTx({ amount, due_date, final_payment_date, status });

    const updatedInstallment = db.prepare("SELECT * FROM installments WHERE installment_id = ?").get(id);

    res.json({ message: "Installment updated successfully", data: updatedInstallment });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/installments/:id — Disable deletion
router.delete("/:id", (req, res) => {
  res.status(405).json({ 
    error_code: "NOT_ALLOWED", 
    error_ar: "لا يمكن حذف الأقساط من النظام",
    error: "Installment deletion is not allowed" 
  });
});

module.exports = router;
