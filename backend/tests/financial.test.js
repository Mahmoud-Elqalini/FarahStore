const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Financial Precision & WAC', () => {
  let categoryId;
  let supplierId;
  let productId;

  beforeAll(() => {
    const cat = db.prepare("INSERT INTO categories (category_name, is_active) VALUES ('Financial Category', 1)").run();
    categoryId = cat.lastInsertRowid;

    const sup = db.prepare("INSERT INTO suppliers (supplier_name, phone, is_active) VALUES ('Financial Supplier', '01777777777', 1)").run();
    supplierId = sup.lastInsertRowid;
  });

  beforeEach(() => {
    // Create a product with 0 stock to test exact WAC
    const prod = db.prepare(`
      INSERT INTO products (product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode, sku, is_active)
      VALUES ('Financial Product', 0, 50, 0, ?, ?, 'FIN-123', 'SKU-FIN-1', 1)
    `).run(categoryId, supplierId);
    productId = prod.lastInsertRowid;
  });

  it('should calculate WAC (Weighted Average Cost) and round to 2 decimals correctly', async () => {
    // 1st Restock: 73 items @ 12.37
    let res = await request(app).post(`/api/products/${productId}/restock`).send({
      quantity: 73,
      purchase_price: 12.37,
      selling_price: 50 // Keep selling price high to avoid constraint error
    });
    expect(res.status).toBe(200);
    expect(res.body.data.purchase_price).toBe(12.37);

    // 2nd Restock: 27 items @ 13.91
    res = await request(app).post(`/api/products/${productId}/restock`).send({
      quantity: 27,
      purchase_price: 13.91,
      selling_price: 50
    });
    
    expect(res.status).toBe(200);
    
    // Math:
    // (73 * 12.37) + (27 * 13.91) = 903.01 + 375.57 = 1278.58
    // 1278.58 / 100 = 12.7858
    // System should round to 2 decimals using .toFixed(2) -> 12.79
    expect(res.body.data.stock_quantity).toBe(100);
    expect(res.body.data.purchase_price).toBe(12.79);

    // Verify in database
    const dbProduct = db.prepare('SELECT purchase_price FROM products WHERE product_id = ?').get(productId);
    expect(dbProduct.purchase_price).toBe(12.79);
  });

  it('should prevent WAC from exceeding selling price (Business Logic validation)', async () => {
    // Product starts at 0 stock. Restock 10 at 100, selling = 120. WAC = 100.
    let res = await request(app).post(`/api/products/${productId}/restock`).send({
      quantity: 10,
      purchase_price: 100,
      selling_price: 120
    });
    expect(res.status).toBe(200);

    // Attempt to restock 10 at 200 without changing selling price. 
    // WAC would become 150.
    // Since 150 > 120, it should fail with a 400 Bad Request.
    res = await request(app).post(`/api/products/${productId}/restock`).send({
      quantity: 10,
      purchase_price: 200
    });
    
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('PRICE_LOGIC_ERROR');

    // Attempt to restock 10 at 200 WITH changing selling price to 160.
    // WAC = 150. Since 150 <= 160, it should succeed.
    res = await request(app).post(`/api/products/${productId}/restock`).send({
      quantity: 10,
      purchase_price: 200,
      selling_price: 160
    });
    
    expect(res.status).toBe(200);
    expect(res.body.data.purchase_price).toBe(150);
    expect(res.body.data.selling_price).toBe(160);
  });
});
