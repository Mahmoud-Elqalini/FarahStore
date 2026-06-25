const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

describe('Advanced Integrity and Business Logic Tests', () => {
  let categoryId, supplierId, customerId, productId1, productId2;

  beforeAll(async () => {
    // Setup basic entities directly via DB to ensure isolation
    const cat = await pool.query("INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id", ['Adv Cat ' + Date.now()]);
    categoryId = cat.rows[0].category_id;

    const sup = await pool.query("INSERT INTO suppliers (supplier_name, phone) VALUES ($1, $2) RETURNING supplier_id", ['Adv Sup ' + Date.now(), '01000000000']);
    supplierId = sup.rows[0].supplier_id;

    const cust = await pool.query("INSERT INTO customers (customer_name, phone) VALUES ($1, $2) RETURNING customer_id", ['Adv Cust ' + Date.now(), '01000000001']);
    customerId = cust.rows[0].customer_id;

    const prod1 = await pool.query(
      "INSERT INTO products (product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING product_id",
      ['Adv Prod 1 ' + Date.now(), 100, 200, 50, categoryId, supplierId]
    );
    productId1 = prod1.rows[0].product_id;

    const prod2 = await pool.query(
      "INSERT INTO products (product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING product_id",
      ['Adv Prod 2 ' + Date.now(), 50, 100, 1, categoryId, supplierId]
    );
    productId2 = prod2.rows[0].product_id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM installments");
    await pool.query("DELETE FROM order_details");
    await pool.query("DELETE FROM orders");
    await pool.query("DELETE FROM customers WHERE customer_id = $1", [customerId]);
    await pool.query("DELETE FROM products WHERE product_id IN ($1, $2)", [productId1, productId2]);
    await pool.query("DELETE FROM suppliers WHERE supplier_id = $1", [supplierId]);
    await pool.query("DELETE FROM categories WHERE category_id = $1", [categoryId]);
    await pool.end();
  });

  describe("TEST GROUP 1: INVENTORY PROTECTION", () => {
    it("1. Insufficient Stock: Request fails when requested quantity > available stock", async () => {
      const res = await request(app).post('/api/orders').send({
        p_customer_id: customerId,
        p_payment_type: 'Cash',
        p_total_amount: 10000,
        p_items: [{ product_id: productId1, quantity: 100, unit_price: 100 }] // stock is 50
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe("INSUFFICIENT_STOCK");
      
      const checkProd = await pool.query("SELECT stock_quantity FROM products WHERE product_id = $1", [productId1]);
      expect(checkProd.rows[0].stock_quantity).toBe(50);
    });

    it("2. Inventory Never Goes Negative", async () => {
      const res = await request(app).post('/api/orders').send({
        p_customer_id: customerId,
        p_payment_type: 'Cash',
        p_total_amount: 200,
        p_items: [{ product_id: productId2, quantity: 2, unit_price: 100 }] // stock is 1
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe("INSUFFICIENT_STOCK");
      
      const checkProd = await pool.query("SELECT stock_quantity FROM products WHERE product_id = $1", [productId2]);
      expect(checkProd.rows[0].stock_quantity).toBe(1);
    });
  });

  describe("TEST GROUP 2: STOCK DEDUCTION VERIFICATION", () => {
    it("Deducts stock correctly upon order creation", async () => {
      // product1 stock is 50
      const res = await request(app).post('/api/orders').send({
        p_customer_id: customerId,
        p_payment_type: 'Cash',
        p_total_amount: 1000,
        p_items: [{ product_id: productId1, quantity: 5, unit_price: 200 }]
      });
      expect(res.status).toBe(201);
      
      const checkProd = await pool.query("SELECT stock_quantity FROM products WHERE product_id = $1", [productId1]);
      expect(checkProd.rows[0].stock_quantity).toBe(45); // 50 - 5
    });
  });

  describe("TEST GROUP 3: TRANSACTION ROLLBACK SAFETY", () => {
    it("Rolls back entire transaction if one item is invalid", async () => {
      const res = await request(app).post('/api/orders').send({
        p_customer_id: customerId,
        p_payment_type: 'Cash',
        p_total_amount: 200 + 200, // Valid item + invalid item
        p_items: [
          { product_id: productId1, quantity: 1, unit_price: 200 }, // valid
          { product_id: 99999, quantity: 1, unit_price: 200 } // invalid product
        ]
      });
      expect(res.status).toBe(400);

      // Verify product1 stock wasn't deducted
      const checkProd = await pool.query("SELECT stock_quantity FROM products WHERE product_id = $1", [productId1]);
      expect(checkProd.rows[0].stock_quantity).toBe(45); // unchanged from previous test
    });
  });

  describe("TEST GROUP 4: PAYMENT / INSTALLMENT INTEGRITY", () => {
    let testOrderId, testInstallmentId;

    beforeAll(async () => {
      // Create order and installments for tests
      const orderRes = await request(app).post('/api/orders').send({
        p_customer_id: customerId,
        p_payment_type: 'Installment',
        p_total_amount: 400,
        p_items: [{ product_id: productId1, quantity: 2, unit_price: 200 }]
      });
      testOrderId = orderRes.body.data.order_id || orderRes.body.data.create_order || orderRes.body.data.id;

      await request(app).post('/api/installments').send({
        p_order_id: testOrderId,
        p_months: 2,
        p_first_due_date: '2025-01-01'
      });

      const instRes = await request(app).get(`/api/installments/order/${testOrderId}`);
      testInstallmentId = instRes.body[0].installment_id;
    });

    it("1. Mark already-paid installment as Paid again", async () => {
      await request(app).put(`/api/installments/${testInstallmentId}`).send({ status: 'Paid', payment_date: '2024-12-01' });
      
      const res = await request(app).put(`/api/installments/${testInstallmentId}`).send({ status: 'Paid', payment_date: '2024-12-02' });
      // DOCUMENTED BEHAVIOR: The system allows marking an already paid installment as 'Paid' again, returning 200 OK (Idempotent update).
      expect(res.status).toBe(200); 
    });

    it("2. Attempt invalid status update", async () => {
      const res = await request(app).put(`/api/installments/${testInstallmentId}`).send({ status: 'InvalidStatus' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_STATUS');
    });

    it("3. Attempt payment update on non-existing installment", async () => {
      const res = await request(app).put(`/api/installments/99999`).send({ status: 'Paid', payment_date: '2024-12-01' });
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe("TEST GROUP 5: ORDER TOTAL TAMPERING", () => {
    it("Case A: submitted total < items total", async () => {
      const res = await request(app).post('/api/orders').send({
        p_customer_id: customerId,
        p_payment_type: 'Cash',
        p_total_amount: 100, // actual is 200
        p_items: [{ product_id: productId1, quantity: 1, unit_price: 200 }]
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('AMOUNT_MISMATCH');
    });

    it("Case B: submitted total > items total", async () => {
      const res = await request(app).post('/api/orders').send({
        p_customer_id: customerId,
        p_payment_type: 'Cash',
        p_total_amount: 300, // actual is 200
        p_items: [{ product_id: productId1, quantity: 1, unit_price: 200 }]
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('AMOUNT_MISMATCH');
    });
  });

  describe("TEST GROUP 6: DASHBOARD ACCURACY", () => {
    it("Verify dashboard values reflect the actual database", async () => {
      const res = await request(app).get('/api/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.counts).toBeDefined();
      expect(res.body.counts.customers).toBeGreaterThanOrEqual(1);
      expect(res.body.counts.products).toBeGreaterThanOrEqual(2);
      expect(res.body.counts.orders.total).toBeGreaterThanOrEqual(2); // 1 cash, 1 installment created in previous tests
    });
  });

  describe("TEST GROUP 7: SQL INJECTION DEFENSE", () => {
    it("Protects against SQL injection in fields", async () => {
      const res = await request(app).post('/api/categories').send({
        category_name: "'; DROP TABLE customers; --"
      });
      expect(res.status).toBe(201); // Created successfully as a literal string

      // Verify table still exists
      const check = await pool.query("SELECT count(*) FROM customers");
      expect(parseInt(check.rows[0].count)).toBeGreaterThanOrEqual(1);
      
      // Cleanup the injected category
      await pool.query("DELETE FROM categories WHERE category_name = $1", ["'; DROP TABLE customers; --"]);
    });
  });

  describe("TEST GROUP 8: CONCURRENCY / RACE CONDITIONS", () => {
    it("Prevents negative stock on concurrent order creation", async () => {
      // product2 stock is 1
      const orderData = {
        p_customer_id: customerId,
        p_payment_type: 'Cash',
        p_total_amount: 100,
        p_items: [{ product_id: productId2, quantity: 1, unit_price: 100 }]
      };

      const results = await Promise.all([
        request(app).post('/api/orders').send(orderData),
        request(app).post('/api/orders').send(orderData)
      ]);

      // Assert at most one succeeds
      const successes = results.filter(r => r.status === 201).length;
      expect(successes).toBeLessThanOrEqual(1);

      // Ensure stock doesn't go below 0
      const checkProd = await pool.query("SELECT stock_quantity FROM products WHERE product_id = $1", [productId2]);
      expect(checkProd.rows[0].stock_quantity).toBeGreaterThanOrEqual(0);
    });
  });
});
