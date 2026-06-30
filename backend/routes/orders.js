const router = require("express").Router();
const db = require("../config/db");

// GET /api/orders — Get all orders
router.get("/", (req, res, next) => {
  try {
    const query = `
      SELECT o.*, c.customer_name 
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      ORDER BY o.order_id DESC
    `;
    const result = db.prepare(query).all();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — Get single order with details
router.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // Get Order Info
    const orderQuery = `
      SELECT o.*, c.customer_name 
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      WHERE o.order_id = ?
    `;
    const orderData = db.prepare(orderQuery).get(id);

    if (!orderData) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Order not found" });
    }

    // Get Order Details
    const detailsQuery = `
      SELECT od.*, p.product_name 
      FROM order_details od
      LEFT JOIN products p ON od.product_id = p.product_id
      WHERE od.order_id = ?
    `;
    const detailsResult = db.prepare(detailsQuery).all(id);
    
    orderData.items = detailsResult;

    // Calculate remaining_balance
    if (orderData.payment_type === 'Cash') {
      orderData.remaining_balance = 0;
      orderData.paid_amount = orderData.total_amount;
    } else {
      const remainingQuery = `
        SELECT COALESCE(SUM(amount), 0) as remaining_balance
        FROM installments
        WHERE order_id = ? AND status IN ('Pending', 'Late')
      `;
      const remainingResult = db.prepare(remainingQuery).get(id);
      orderData.remaining_balance = Number(remainingResult.remaining_balance);

      const paidQuery = `
        SELECT COALESCE(SUM(amount), 0) as paid_amount
        FROM installments
        WHERE order_id = ? AND status = 'Paid'
      `;
      const paidResult = db.prepare(paidQuery).get(id);
      orderData.paid_amount = (orderData.down_payment || 0) + Number(paidResult.paid_amount);

      const instInfoQuery = `
        SELECT COUNT(*) as months, MIN(amount) as monthly_amount
        FROM installments
        WHERE order_id = ?
      `;
      const instInfo = db.prepare(instInfoQuery).get(id);
      orderData.months = instInfo.months;
      orderData.monthly_amount = instInfo.monthly_amount;

      orderData.final_total = orderData.paid_amount + orderData.remaining_balance;
    }

    orderData.products_total = orderData.total_amount;

    res.json(orderData);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — Create new order
router.post("/", (req, res, next) => {
  try {
    const { customer_id, payment_type, items, months, first_due_date, down_payment, interest_rate } = req.body;

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

    // Define JS Transaction for create_order and generate_installments
    const createOrderTx = db.transaction((orderData) => {
      const { customerId, payType, reqItems, numMonths, firstDueDate, downPayment, interestRate } = orderData;
      
      // 2. Validate Customer
      const custRes = db.prepare('SELECT is_active FROM customers WHERE customer_id = ?').get(customerId);
      if (!custRes || custRes.is_active === 0) {
        throw new Error('CUSTOMER_NOT_FOUND');
      }
      
      // 3. Fetch Prices & Validate Products & Check Stock
      let totalAmount = 0;
      const finalItems = [];
      
      for (const item of reqItems) {
        const prod = db.prepare('SELECT product_name, selling_price, stock_quantity, is_active FROM products WHERE product_id = ?').get(item.product_id);
        if (!prod || prod.is_active === 0) {
          throw new Error(`PRODUCT_NOT_FOUND:${item.product_id}`);
        }
        if (prod.stock_quantity < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${item.product_id}:${prod.product_name}:${prod.stock_quantity}`);
        }
        
        const price = Number(prod.selling_price);
        totalAmount += price * item.quantity;
        
        finalItems.push({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: price
        });
      }
      
      // 4. Create Order
      const initialStatus = payType === 'Cash' ? 'Completed' : 'Active';
      let actualDownPayment = 0;
      let actualRate = 0;

      if (payType === 'Installment') {
        actualDownPayment = downPayment || 0;
        actualRate = interestRate || 0;
      }

      const orderInfo = db.prepare(`
        INSERT INTO orders (customer_id, payment_type, total_amount, order_status, installment_rate, down_payment)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(customerId, payType, totalAmount, initialStatus, actualRate, actualDownPayment);
      
      const newOrderId = orderInfo.lastInsertRowid;
      
      // 5. Create Order Details and Update Stock
      const insertDetail = db.prepare(`INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)`);
      const updateStock = db.prepare(`UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?`);
      
      for (const item of finalItems) {
        insertDetail.run(newOrderId, item.product_id, item.quantity, item.unit_price);
        updateStock.run(item.quantity, item.product_id);
      }
      
      // 6. Generate Installments if needed
      let totalInstallmentDebt = 0;
      if (payType === 'Installment') {
        const insertInstallment = db.prepare(`INSERT INTO installments (order_id, installment_number, amount, due_date, status) VALUES (?, ?, ?, ?, 'Pending')`);
        
        const remaining = totalAmount - actualDownPayment;
        const interestAmount = remaining * (actualRate / 100);
        totalInstallmentDebt = remaining + interestAmount;

        const baseAmount = Math.round(totalInstallmentDebt / numMonths);
        let totalAssigned = 0;
        
        const firstDate = new Date(firstDueDate);
        
        for (let i = 1; i <= numMonths; i++) {
          let currentAmount = baseAmount;
          
          if (i === numMonths) {
            currentAmount = totalInstallmentDebt - totalAssigned;
          }
          
          // Calculate date for this specific installment (offset by i-1 months)
          const currentDate = new Date(firstDate);
          const targetMonth = currentDate.getMonth() + (i - 1);
          const expectedMonth = targetMonth % 12;
          
          currentDate.setMonth(targetMonth);
          
          // If the engine overflowed the month (e.g., Jan 31 -> Mar 3), roll back to last day of expected month
          if (currentDate.getMonth() !== expectedMonth) {
            currentDate.setDate(0);
          }
          
          // Format the date for the current installment
          const formattedDate = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
          
          insertInstallment.run(newOrderId, i, currentAmount, formattedDate);
          totalAssigned += currentAmount;
        }
      }
      
      return { newOrderId, totalAmount, actualDownPayment, totalInstallmentDebt };
    });

    try {
      const { newOrderId, totalAmount, actualDownPayment, totalInstallmentDebt } = createOrderTx({
        customerId: customer_id,
        payType: payment_type,
        reqItems: items,
        numMonths: months,
        firstDueDate: first_due_date,
        downPayment: down_payment,
        interestRate: interest_rate
      });
      
      // Success Response
      const paid_amount = payment_type === 'Cash' ? totalAmount : actualDownPayment;
      const remaining_balance = payment_type === 'Installment' ? totalInstallmentDebt : 0;
      const final_total = payment_type === 'Installment' ? (actualDownPayment + totalInstallmentDebt) : totalAmount;

      res.status(201).json({
        success: true,
        order_id: newOrderId,
        invoice_number: `ORD-${newOrderId}`,
        created_at: new Date().toISOString(),
        total_amount: final_total,
        products_total: totalAmount,
        payment_type,
        paid_amount,
        remaining_balance,
        down_payment: actualDownPayment,
        interest_rate: interest_rate || 0,
        months: months || 0,
        monthly_amount: payment_type === 'Installment' ? (totalInstallmentDebt / months) : 0,
        message: "تم إنشاء الفاتورة بنجاح"
      });
      
    } catch (txErr) {
      if (txErr.message === 'CUSTOMER_NOT_FOUND') {
        return res.status(400).json({ error_code: "NOT_FOUND", error_ar: "العميل غير موجود أو محذوف", error: "Customer not found or inactive" });
      }
      if (txErr.message.startsWith('PRODUCT_NOT_FOUND:')) {
        const pId = txErr.message.split(':')[1];
        return res.status(400).json({ error_code: "NOT_FOUND", error_ar: "المنتج غير موجود أو محذوف", error: `Product ${pId} not found or inactive` });
      }
      if (txErr.message.startsWith('INSUFFICIENT_STOCK:')) {
        const parts = txErr.message.split(':');
        const pId = parts[1];
        const pName = parts[2];
        const pStock = parts[3];
        return res.status(400).json({
          error_code: "INSUFFICIENT_STOCK",
          error_ar: `المنتج '${pName}' متاح بكمية ${pStock} فقط`,
          error: `Insufficient stock for product ${pId}`
        });
      }
      throw txErr;
    }

  } catch (err) {
    next(err);
  }
});

// PUT /api/orders/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Order ID is required" });
});

// PUT /api/orders/:id — Update order (Partial Update)
router.put("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch existing order
    const existing = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Order not found" });
    }

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
    db.prepare(`UPDATE orders SET customer_id = ? WHERE order_id = ?`).run(customer_id, id);
    const updatedOrder = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(id);

    res.json({ message: "Order updated successfully", data: updatedOrder });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orders/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Order ID is required" });
});

// DELETE /api/orders/:id — Delete order
router.delete("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    
    const checkResult = db.prepare("SELECT order_status FROM orders WHERE order_id = ?").get(id);
    if (!checkResult) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Order not found" });
    }
    if (checkResult.order_status === 'Cancelled') {
      return res.status(400).json({ error_code: "ALREADY_CANCELLED", error_ar: "الطلب ملغي بالفعل", error: "Order is already cancelled" });
    }

    db.prepare("UPDATE orders SET order_status = 'Cancelled' WHERE order_id = ?").run(id);
    const cancelledOrder = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(id);
    
    res.json({ message: "تم إلغاء الطلب بنجاح", data: cancelledOrder });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
