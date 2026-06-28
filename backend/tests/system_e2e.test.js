const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe("System E2E Tests", () => {
  const customerId = 1;
  const productId = 1;

  describe("Restock & WAC", () => {
    it("should correctly calculate Weighted Average Cost and update stock upon restock", async () => {
      // Global seed: qty=10, pp=100
      // Restock: qty=5, pp=200
      // Expected new qty: 15
      // Expected new WAC: (10*100 + 5*200) / 15 = 2000 / 15 = 133.33...
      const restockRes = await request(app).post(`/api/products/${productId}/restock`).send({
        quantity: 5,
        purchase_price: 200
      });
      expect(restockRes.status).toBe(200);

      const checkRes = await request(app).get(`/api/products/${productId}`);
      const updatedProd = checkRes.body;

      expect(Number(updatedProd.stock_quantity)).toBe(15);
      const expectedWac = (10 * 100 + 5 * 200) / 15;
      expect(Number(updatedProd.purchase_price)).toBeCloseTo(expectedWac, 2);
    });
  });

  describe("Cash Orders & Dashboard Stats", () => {
    it("should create a cash order, decrement stock, and update dashboard delta", async () => {
      const dashBefore = await request(app).get('/api/dashboard');
      const revBefore = Number(dashBefore.body.sales?.total) || 0;
      const ordersBefore = Number(dashBefore.body.counts?.orders?.total) || 0;

      const orderRes = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [
          { product_id: productId, quantity: 2, unit_price: 150 } // Total 300
        ]
      });

      expect(orderRes.status).toBe(201);

      const dashAfter = await request(app).get('/api/dashboard');
      const revAfter = Number(dashAfter.body.sales?.total) || 0;
      const ordersAfter = Number(dashAfter.body.counts?.orders?.total) || 0;

      expect(revAfter - revBefore).toBe(300);
      expect(ordersAfter - ordersBefore).toBe(1);

      const dbOrder = db.prepare('SELECT total_amount, order_status FROM orders WHERE order_id = ?').get(orderRes.body.order_id);
      expect(Number(dbOrder.total_amount)).toBe(300);
      expect(dbOrder.order_status).toBe('Completed');

      const dbProduct = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?').get(productId);
      expect(Number(dbProduct.stock_quantity)).toBe(8); // 10 - 2
    });
  });

  describe("Installments Lifecycle", () => {
    it("should handle installment creation, remaining balance reductions, and auto-completion", async () => {
      const orderRes = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Installment',
        months: 3,
        first_due_date: '2026-07-01',
        items: [
          { product_id: productId, quantity: 3, unit_price: 150 } // Total 450
        ]
      });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.order_id;
      
      const checkOrder = await request(app).get(`/api/orders/${orderId}`);
      expect(checkOrder.body.order_status).toBe('Active');
      expect(Number(checkOrder.body.remaining_balance)).toBe(450);

      const instRes = await request(app).get(`/api/installments/order/${orderId}`);
      expect(instRes.body.length).toBe(3);
      const inst1 = instRes.body[0].installment_id;
      const inst2 = instRes.body[1].installment_id;
      const inst3 = instRes.body[2].installment_id;

      await request(app).patch(`/api/installments/${inst1}/pay`).send({});
      const checkOrder2 = await request(app).get(`/api/orders/${orderId}`);
      expect(Number(checkOrder2.body.remaining_balance)).toBe(300);

      await request(app).patch(`/api/installments/${inst2}/pay`).send({});
      const checkOrder3 = await request(app).get(`/api/orders/${orderId}`);
      expect(Number(checkOrder3.body.remaining_balance)).toBe(150);

      await request(app).patch(`/api/installments/${inst3}/pay`).send({});
      const checkOrder4 = await request(app).get(`/api/orders/${orderId}`);
      expect(Number(checkOrder4.body.remaining_balance)).toBe(0);
      expect(checkOrder4.body.order_status).toBe('Completed');
    });
  });

  describe("Soft Delete Constraints", () => {
    it("should prevent orders for deleted products", async () => {
      await request(app).delete(`/api/products/${productId}`);

      const orderRes = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [{ product_id: productId, quantity: 1, unit_price: 150 }]
      });

      expect(orderRes.status).toBe(400);
      expect(orderRes.body.error).toContain("inactive");
    });
  });

  describe("Validation Edge Cases & DB Atomicity (Rollbacks)", () => {
    it("should completely rollback when attempting to buy out-of-stock items", async () => {
      const ordersCountBefore = db.prepare('SELECT count(*) as count FROM orders').get().count;

      const orderRes = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [{ product_id: productId, quantity: 20, unit_price: 150 }] // 20 > 10
      });
      expect(orderRes.status).toBe(400);

      const ordersCountAfter = db.prepare('SELECT count(*) as count FROM orders').get().count;
      expect(ordersCountAfter).toBe(ordersCountBefore); // No new order

      const stockCheck = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?').get(productId);
      expect(Number(stockCheck.stock_quantity)).toBe(10);
    });

    it("should reject decimal quantities and negative quantities", async () => {
      const resDec = await request(app).post('/api/orders').send({
        customer_id: customerId, payment_type: 'Cash',
        items: [{ product_id: productId, quantity: 1.5, unit_price: 150 }]
      });
      expect(resDec.status).toBe(400);

      const resNeg = await request(app).post('/api/orders').send({
        customer_id: customerId, payment_type: 'Cash',
        items: [{ product_id: productId, quantity: -1, unit_price: 150 }]
      });
      expect(resNeg.status).toBe(400);
    });

    it("should reject empty cart", async () => {
      const orderRes = await request(app).post('/api/orders').send({
        customer_id: customerId, payment_type: 'Cash',
        items: []
      });
      expect(orderRes.status).toBe(400);
    });
  });
});
