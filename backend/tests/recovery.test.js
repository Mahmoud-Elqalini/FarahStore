const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Recovery & Rollback Tests', () => {
  let customerId;
  let productId;

  beforeAll(() => {
    // Setup necessary test data
    const cat = db.prepare("INSERT INTO categories (category_name, is_active) VALUES ('Recovery Category', 1)").run();
    const sup = db.prepare("INSERT INTO suppliers (supplier_name, phone, is_active) VALUES ('Recovery Supplier', '01999999999', 1)").run();
    
    const cust = db.prepare("INSERT INTO customers (customer_name, phone, is_active) VALUES ('Recovery Customer', '01111111111', 1)").run();
    customerId = cust.lastInsertRowid;

    const prod = db.prepare(`
      INSERT INTO products (product_name, category_id, supplier_id, purchase_price, selling_price, stock_quantity, is_active, sku, barcode) 
      VALUES ('Recovery Product', ?, ?, 10, 20, 100, 1, 'REC-SKU', 'REC-BAR')
    `).run(cat.lastInsertRowid, sup.lastInsertRowid);
    productId = prod.lastInsertRowid;
  });

  describe('Transaction Rollback on Errors', () => {
    it('should rollback the entire transaction if an error occurs midway', async () => {
      const initialStock = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?').get(productId).stock_quantity;
      const initialOrdersCount = db.prepare('SELECT count(*) as count FROM orders').get().count;

      // We will create a manual transaction just like the production code
      // We will purposefully throw an error in the middle of it
      let errorThrown = false;
      
      const failingTransaction = db.transaction(() => {
        // Step 1: Insert an order header (Success)
        const orderInfo = db.prepare(`
          INSERT INTO orders (customer_id, payment_type, total_amount, order_status)
          VALUES (?, 'Cash', 20, 'Completed')
        `).run(customerId);

        // Step 2: Update stock (Success)
        db.prepare('UPDATE products SET stock_quantity = stock_quantity - 1 WHERE product_id = ?').run(productId);

        // Step 3: Throw an intentional error to simulate a crash or validation failure
        throw new Error('CRITICAL_SYSTEM_FAILURE_MIDWAY');
      });

      try {
        failingTransaction();
      } catch (err) {
        expect(err.message).toBe('CRITICAL_SYSTEM_FAILURE_MIDWAY');
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);

      // VERIFICATION: Rollback Check
      // 1. The order header should NOT exist in the database (Rollback)
      const currentOrdersCount = db.prepare('SELECT count(*) as count FROM orders').get().count;
      expect(currentOrdersCount).toBe(initialOrdersCount);

      // 2. The stock quantity should have reverted back to its original state (Rollback)
      const currentStock = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?').get(productId).stock_quantity;
      expect(currentStock).toBe(initialStock);
    });

    it('should successfully rollback via API when a later validation fails', async () => {
      const initialStock = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?').get(productId).stock_quantity;
      const initialOrdersCount = db.prepare('SELECT count(*) as count FROM orders').get().count;

      // Try to create an order via API where the first item is valid but the second is invalid (e.g. unknown product)
      const res = await request(app).post('/api/orders').send({
        customer_id: customerId,
        pay_type: 'Cash',
        req_items: [
          { product_id: productId, quantity: 1 }, // Valid
          { product_id: 999999, quantity: 1 }     // Invalid, will cause PRODUCT_NOT_FOUND
        ]
      });

      expect(res.status).toBe(400); // Bad Request

      // Verify NO partial order was created
      const currentOrdersCount = db.prepare('SELECT count(*) as count FROM orders').get().count;
      expect(currentOrdersCount).toBe(initialOrdersCount);

      // Verify NO partial stock was deducted
      const currentStock = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?').get(productId).stock_quantity;
      expect(currentStock).toBe(initialStock);
    });
  });
});
