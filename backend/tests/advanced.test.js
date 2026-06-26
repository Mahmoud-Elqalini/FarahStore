const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

describe("Advanced Integrity and Business Logic Tests", () => {
  let customerId, productId1, productId2, categoryId, supplierId;

  beforeAll(async () => {
    // Setup necessary entities
    const catRes = await request(app).post('/api/categories').send({ category_name: 'Advanced Cat' });
    categoryId = catRes.body.category_id;

    const supRes = await request(app).post('/api/suppliers').send({ supplier_name: 'Advanced Sup', phone: '111222333' });
    supplierId = supRes.body.data.supplier_id;

    const custRes = await request(app).post('/api/customers').send({ customer_name: 'Advanced Cust', phone: '444555666' });
    customerId = custRes.body.data.customer_id;

    const prod1Res = await request(app).post('/api/products').send({
      product_name: 'Adv Prod 1', purchase_price: 50, selling_price: 100, stock_quantity: 50, category_id: categoryId, supplier_id: supplierId
    });
    productId1 = prod1Res.body.data.product_id;

    const prod2Res = await request(app).post('/api/products').send({
      product_name: 'Adv Prod 2', purchase_price: 20, selling_price: 40, stock_quantity: 1, category_id: categoryId, supplier_id: supplierId
    });
    productId2 = prod2Res.body.data.product_id;
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
        customer_id: customerId,
        payment_type: 'Cash',
        items: [{ product_id: productId1, quantity: 100, unit_price: 100 }] // stock is 50
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe("INSUFFICIENT_STOCK");
    });

    it("2. Inventory Never Goes Negative", async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [{ product_id: productId2, quantity: 2, unit_price: 100 }] // stock is 1
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe("INSUFFICIENT_STOCK");
    });
  });

  describe("TEST GROUP 2: STOCK DEDUCTION VERIFICATION", () => {
    it("Deducts stock correctly upon order creation", async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [{ product_id: productId1, quantity: 5, unit_price: 200 }]
      });
      expect(res.status).toBe(201);
      
      const checkProd = await pool.query("SELECT stock_quantity FROM products WHERE product_id = $1", [productId1]);
      expect(checkProd.rows[0].stock_quantity).toBe(45); // 50 - 5
    });
  });

  describe("TEST GROUP 3: TRANSACTION ROLLBACK SAFETY", () => {
    it("Rolls back entire transaction if one item is invalid", async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [
          { product_id: productId1, quantity: 1, unit_price: 200 }, // valid
          { product_id: 99999, quantity: 1, unit_price: 200 } // invalid product
        ]
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('NOT_FOUND');
      
      // stock should not be deducted for the first valid item because of rollback
      const checkProd = await pool.query("SELECT stock_quantity FROM products WHERE product_id = $1", [productId1]);
      expect(checkProd.rows[0].stock_quantity).toBe(45); // unchanged
    });
  });

  describe("TEST GROUP 4: INSTALLMENT ENDPOINTS", () => {
    it("Attempt payment update on non-existing installment", async () => {
      const res = await request(app).patch(`/api/installments/99999/pay`).send();
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe("TEST GROUP 5: DASHBOARD ACCURACY", () => {
    it("Verify dashboard endpoint responds successfully", async () => {
      const res = await request(app).get('/api/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.counts).toBeDefined();
    });
  });
});
