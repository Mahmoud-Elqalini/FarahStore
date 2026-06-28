const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe("Advanced Integrity and Business Logic Tests", () => {
  // We rely on the global seed from setup.js
  // customer_id = 1, product_id = 1, stock_quantity = 10
  const customerId = 1;
  const productId = 1;

  describe("TEST GROUP 1: INVENTORY PROTECTION", () => {
    it("1. Insufficient Stock: Request fails when requested quantity > available stock", async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [{ product_id: productId, quantity: 20, unit_price: 100 }] // stock is 10
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
        items: [{ product_id: productId, quantity: 2, unit_price: 150 }]
      });
      expect(res.status).toBe(201);
      
      const checkProd = db.prepare("SELECT stock_quantity FROM products WHERE product_id = ?").get(productId);
      expect(checkProd.stock_quantity).toBe(8); // 10 - 2
    });
  });

  describe("TEST GROUP 3: TRANSACTION ROLLBACK SAFETY", () => {
    it("Rolls back entire transaction if one item is invalid", async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [
          { product_id: productId, quantity: 1, unit_price: 150 }, // valid
          { product_id: 99999, quantity: 1, unit_price: 200 } // invalid product
        ]
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('NOT_FOUND');
      
      // stock should not be deducted for the first valid item because of rollback
      const checkProd = db.prepare("SELECT stock_quantity FROM products WHERE product_id = ?").get(productId);
      expect(checkProd.stock_quantity).toBe(10); // unchanged
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
