const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Validation & Edge Cases', () => {
  let customerId;
  let categoryId;
  let supplierId;
  let productId;
  let inactiveProductId;

  beforeAll(() => {
    const cat = db.prepare("INSERT INTO categories (category_name, is_active) VALUES ('Validation Category', 1)").run();
    categoryId = cat.lastInsertRowid;

    const sup = db.prepare("INSERT INTO suppliers (supplier_name, phone, is_active) VALUES ('Validation Supplier', '01444444444', 1)").run();
    supplierId = sup.lastInsertRowid;

    const cust = db.prepare("INSERT INTO customers (customer_name, phone, is_active) VALUES ('Validation Customer', '01333333333', 1)").run();
    customerId = cust.lastInsertRowid;
  });

  beforeEach(() => {
    // Create an active product
    let prod = db.prepare(`
      INSERT INTO products (product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode, sku, is_active)
      VALUES ('Valid Product', 50, 100, 100, ?, ?, 'VALID-123', 'SKU-VALID', 1)
    `).run(categoryId, supplierId);
    productId = prod.lastInsertRowid;

    // Create an inactive product
    prod = db.prepare(`
      INSERT INTO products (product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode, sku, is_active)
      VALUES ('Inactive Product', 50, 100, 100, ?, ?, 'INACTIVE-123', 'SKU-INACTIVE', 0)
    `).run(categoryId, supplierId);
    inactiveProductId = prod.lastInsertRowid;
  });

  describe('Product API Validation', () => {
    it('should reject restock with zero or negative quantity', async () => {
      const resZero = await request(app).post(`/api/products/${productId}/restock`).send({
        quantity: 0,
        purchase_price: 10
      });
      expect(resZero.status).toBe(400);

      const resNeg = await request(app).post(`/api/products/${productId}/restock`).send({
        quantity: -5,
        purchase_price: 10
      });
      expect(resNeg.status).toBe(400);
    });

    it('should reject empty or whitespaces product name', async () => {
      const res = await request(app).post('/api/products').send({
        product_name: '   ',
        purchase_price: 10,
        selling_price: 20,
        stock_quantity: 5,
        category_id: categoryId,
        supplier_id: supplierId,
        barcode: 'SPACES-123',
        sku: 'SKU-SPACES'
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Order & Installments API Validation', () => {
    it('should reject order with negative quantity', async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [
          { product_id: productId, quantity: -5, unit_price: 100 }
        ]
      });
      expect(res.status).toBe(400);
    });

    it('should reject selling an inactive product', async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [
          { product_id: inactiveProductId, quantity: 1, unit_price: 100 }
        ]
      });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should reject order with unknown customer or product ID', async () => {
      const resCust = await request(app).post('/api/orders').send({
        customer_id: 999999,
        payment_type: 'Cash',
        items: [
          { product_id: productId, quantity: 1, unit_price: 100 }
        ]
      });
      expect(resCust.status).toBe(400);
      expect(resCust.body.error_code).toBe('NOT_FOUND');

      const resProd = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Cash',
        items: [
          { product_id: 999999, quantity: 1, unit_price: 100 }
        ]
      });
      expect(resProd.status).toBe(400);
      expect(resProd.body.error_code).toBe('NOT_FOUND');
    });

    it('should reject installment order with zero or negative months', async () => {
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        payment_type: 'Installment',
        months: 0,
        first_due_date: '2026-09-01',
        items: [
          { product_id: productId, quantity: 1, unit_price: 100 }
        ]
      });
      expect(res.status).toBe(400);
    });
  });
});
