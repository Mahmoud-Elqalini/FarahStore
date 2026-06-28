const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Concurrency & Race Conditions', () => {
  let customerId;
  let categoryId;
  let supplierId;
  let productId;

  beforeAll(() => {
    // Setup a specific customer, category, and supplier for the test
    const cat = db.prepare("INSERT INTO categories (category_name, is_active) VALUES ('Concurrency Category', 1)").run();
    categoryId = cat.lastInsertRowid;

    const sup = db.prepare("INSERT INTO suppliers (supplier_name, phone, is_active) VALUES ('Concurrency Supplier', '01999999999', 1)").run();
    supplierId = sup.lastInsertRowid;

    const cust = db.prepare("INSERT INTO customers (customer_name, phone, is_active) VALUES ('Concurrency Customer', '01888888888', 1)").run();
    customerId = cust.lastInsertRowid;
  });

  beforeEach(() => {
    // Create a fresh product with exactly 5 stock before each test
    const prod = db.prepare(`
      INSERT INTO products (product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode, sku, is_active)
      VALUES ('Race Condition Product', 10, 20, 5, ?, ?, 'RACE-123', 'SKU-RACE-1', 1)
    `).run(categoryId, supplierId);
    productId = prod.lastInsertRowid;
  });


  it('should handle concurrent orders and prevent negative stock (Race Condition)', async () => {
    // Product has stock = 5
    // Cashier A and Cashier B both try to buy 5 items at the exact same millisecond
    
    const orderPayload = {
      customer_id: customerId,
      payment_type: 'Cash',
      items: [
        { product_id: productId, quantity: 5, unit_price: 20 }
      ]
    };

    // Fire two identical requests concurrently
    const [resA, resB] = await Promise.all([
      request(app).post('/api/orders').send(orderPayload),
      request(app).post('/api/orders').send(orderPayload)
    ]);

    // One must succeed, the other must fail due to INSUFFICIENT_STOCK
    const statuses = [resA.status, resB.status].sort();
    
    // We expect exactly one 201 (Created) and one 400 (Bad Request)
    expect(statuses).toEqual([201, 400]);

    // Let's verify the failing request has the correct error code
    const failedRes = resA.status === 400 ? resA : resB;
    expect(failedRes.body.error_code).toBe('INSUFFICIENT_STOCK');

    // Verify database integrity: Stock must be exactly 0, not -5
    const dbProduct = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?').get(productId);
    expect(Number(dbProduct.stock_quantity)).toBe(0);
  });
});
