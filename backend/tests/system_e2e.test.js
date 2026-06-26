const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');

// --- Helper Functions ---
async function cleanupDatabase() {
  // Ordered from children to parents to respect foreign keys
  await pool.query('DELETE FROM installments');
  await pool.query('DELETE FROM order_details');
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM products');
  await pool.query('DELETE FROM customers');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM categories');
}

beforeAll(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await cleanupDatabase();
  await pool.end();
});

// Variables used across tests in describe blocks
let categoryId, supplierId, customerId, productId;

async function setupBasicData() {
  await cleanupDatabase(); // absolute clean state per test

  const catRes = await request(app).post('/api/categories').send({ category_name: 'Test Category' });
  categoryId = catRes.body.category_id;

  const supRes = await request(app).post('/api/suppliers').send({ supplier_name: 'Test Supplier', contact_info: '123' });
  supplierId = supRes.body.data.supplier_id;

  const custRes = await request(app).post('/api/customers').send({ customer_name: 'Test Customer', phone: '010', national_id: '123' });
  customerId = custRes.body.data.customer_id;

  const prodRes = await request(app).post('/api/products').send({
    product_name: 'Test Product',
    category_id: categoryId,
    supplier_id: supplierId,
    purchase_price: 100,
    selling_price: 150,
    stock_quantity: 10,
    minimum_stock: 2
  });
  productId = prodRes.body.data.product_id;
}

describe("Restock & WAC", () => {
  beforeEach(async () => {
    await setupBasicData();
  });

  it("should correctly calculate Weighted Average Cost and update stock upon restock", async () => {
    // Current state: qty=10, pp=100
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
  beforeEach(async () => {
    await setupBasicData();
  });

  it("should create a cash order, decrement stock, and update dashboard delta", async () => {
    // Baseline dashboard stats
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
    expect(orderRes.body.invoice_number).toMatch(/^ORD-\d+$/);

    // Fetch dashboard again
    const dashAfter = await request(app).get('/api/dashboard');
    const revAfter = Number(dashAfter.body.sales?.total) || 0;
    const ordersAfter = Number(dashAfter.body.counts?.orders?.total) || 0;

    // Validate Delta
    expect(revAfter - revBefore).toBe(300);
    expect(ordersAfter - ordersBefore).toBe(1);

    // Validate DB State
    const dbOrder = await pool.query('SELECT total_amount, order_status FROM orders WHERE order_id = $1', [orderRes.body.order_id]);
    expect(Number(dbOrder.rows[0].total_amount)).toBe(300);
    expect(dbOrder.rows[0].order_status).toBe('Completed');

    const dbDetails = await pool.query('SELECT * FROM order_details WHERE order_id = $1', [orderRes.body.order_id]);
    expect(dbDetails.rows.length).toBe(1);

    const dbProduct = await pool.query('SELECT stock_quantity FROM products WHERE product_id = $1', [productId]);
    expect(Number(dbProduct.rows[0].stock_quantity)).toBe(8); // 10 - 2
  });
});

describe("Installments Lifecycle", () => {
  beforeEach(async () => {
    await setupBasicData();
  });

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
    
    // Check initial remaining balance
    const checkOrder = await request(app).get(`/api/orders/${orderId}`);
    expect(checkOrder.body.order_status).toBe('Active');
    expect(Number(checkOrder.body.remaining_balance)).toBe(450);

    // Fetch installments
    const instRes = await request(app).get(`/api/installments/order/${orderId}`);
    expect(instRes.body.length).toBe(3);
    const inst1 = instRes.body[0].installment_id;
    const inst2 = instRes.body[1].installment_id;
    const inst3 = instRes.body[2].installment_id;

    // Pay 1
    await request(app).patch(`/api/installments/${inst1}/pay`).send({});
    const checkOrder2 = await request(app).get(`/api/orders/${orderId}`);
    expect(Number(checkOrder2.body.remaining_balance)).toBe(300);

    // Pay 2
    await request(app).patch(`/api/installments/${inst2}/pay`).send({});
    const checkOrder3 = await request(app).get(`/api/orders/${orderId}`);
    expect(Number(checkOrder3.body.remaining_balance)).toBe(150);

    // Pay 3
    await request(app).patch(`/api/installments/${inst3}/pay`).send({});
    const checkOrder4 = await request(app).get(`/api/orders/${orderId}`);
    expect(Number(checkOrder4.body.remaining_balance)).toBe(0);
    expect(checkOrder4.body.order_status).toBe('Completed');
  });
});

describe("Mixed Cart Checkout", () => {
  beforeEach(async () => {
    await setupBasicData();
  });

  it("should correctly handle multiple different products in one cart", async () => {
    const prod2Res = await request(app).post('/api/products').send({
      product_name: 'Product 2', category_id: categoryId, supplier_id: supplierId,
      purchase_price: 50, selling_price: 80, stock_quantity: 20, minimum_stock: 2
    });
    const prod2Id = prod2Res.body.data.product_id;

    const prod3Res = await request(app).post('/api/products').send({
      product_name: 'Product 3', category_id: categoryId, supplier_id: supplierId,
      purchase_price: 20, selling_price: 30, stock_quantity: 50, minimum_stock: 2
    });
    const prod3Id = prod3Res.body.data.product_id;

    const orderRes = await request(app).post('/api/orders').send({
      customer_id: customerId,
      payment_type: 'Cash',
      items: [
        { product_id: productId, quantity: 2, unit_price: 150 }, // 300
        { product_id: prod2Id, quantity: 5, unit_price: 80 },    // 400
        { product_id: prod3Id, quantity: 10, unit_price: 30 }    // 300
      ] // Total 1000
    });

    expect(orderRes.status).toBe(201);
    
    const dbOrder = await pool.query('SELECT total_amount FROM orders WHERE order_id = $1', [orderRes.body.order_id]);
    expect(Number(dbOrder.rows[0].total_amount)).toBe(1000);

    const dbDetails = await pool.query('SELECT * FROM order_details WHERE order_id = $1', [orderRes.body.order_id]);
    expect(dbDetails.rows.length).toBe(3);

    const dbP1 = await pool.query('SELECT stock_quantity FROM products WHERE product_id = $1', [productId]);
    expect(Number(dbP1.rows[0].stock_quantity)).toBe(8);

    const dbP2 = await pool.query('SELECT stock_quantity FROM products WHERE product_id = $1', [prod2Id]);
    expect(Number(dbP2.rows[0].stock_quantity)).toBe(15);

    const dbP3 = await pool.query('SELECT stock_quantity FROM products WHERE product_id = $1', [prod3Id]);
    expect(Number(dbP3.rows[0].stock_quantity)).toBe(40);
  });
});

describe("Soft Delete Constraints", () => {
  beforeEach(async () => {
    await setupBasicData();
  });

  it("should prevent orders for deleted products", async () => {
    await request(app).delete(`/api/products/${productId}`);

    const getRes = await request(app).get('/api/products');
    const found = getRes.body.find(p => p.product_id === productId);
    expect(found).toBeUndefined();

    const orderRes = await request(app).post('/api/orders').send({
      customer_id: customerId,
      payment_type: 'Cash',
      items: [
        { product_id: productId, quantity: 1, unit_price: 150 }
      ]
    });

    expect(orderRes.status).toBe(400);
    expect(orderRes.body.error).toContain("inactive");
  });
});

describe("Validation Edge Cases & DB Atomicity (Rollbacks)", () => {
  beforeEach(async () => {
    await setupBasicData();
  });

  it("should completely rollback when attempting to buy out-of-stock items", async () => {
    const orderRes = await request(app).post('/api/orders').send({
      customer_id: customerId,
      payment_type: 'Cash',
      items: [
        { product_id: productId, quantity: 20, unit_price: 150 } // 20 > 10
      ]
    });

    expect(orderRes.status).toBe(400);

    // Verify DB atomicity
    const ordersCount = await pool.query('SELECT count(*) FROM orders');
    expect(Number(ordersCount.rows[0].count)).toBe(0);

    const detailsCount = await pool.query('SELECT count(*) FROM order_details');
    expect(Number(detailsCount.rows[0].count)).toBe(0);

    const stockCheck = await pool.query('SELECT stock_quantity FROM products WHERE product_id = $1', [productId]);
    expect(Number(stockCheck.rows[0].stock_quantity)).toBe(10);
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
