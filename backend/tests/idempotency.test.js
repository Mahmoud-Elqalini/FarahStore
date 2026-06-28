const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Idempotency & Duplicate Requests', () => {
  let customerId;
  let categoryId;
  let supplierId;
  let productId;
  let installmentId;

  beforeAll(() => {
    const cat = db.prepare("INSERT INTO categories (category_name, is_active) VALUES ('Idemp Category', 1)").run();
    categoryId = cat.lastInsertRowid;

    const sup = db.prepare("INSERT INTO suppliers (supplier_name, phone, is_active) VALUES ('Idemp Supplier', '01666666666', 1)").run();
    supplierId = sup.lastInsertRowid;

    const cust = db.prepare("INSERT INTO customers (customer_name, phone, is_active) VALUES ('Idemp Customer', '01555555555', 1)").run();
    customerId = cust.lastInsertRowid;

    const prod = db.prepare(`
      INSERT INTO products (product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode, sku, is_active)
      VALUES ('Idemp Product', 50, 100, 100, ?, ?, 'IDEMP-123', 'SKU-IDEMP', 1)
    `).run(categoryId, supplierId);
    productId = prod.lastInsertRowid;
  });

  beforeEach(async () => {
    // Create a new order with installments to test paying an installment twice
    const orderRes = await request(app).post('/api/orders').send({
      customer_id: customerId,
      payment_type: 'Installment',
      months: 2,
      first_due_date: '2026-08-01',
      items: [
        { product_id: productId, quantity: 1, unit_price: 100 }
      ]
    });
    const orderId = orderRes.body.order_id;
    
    // Fetch installments for this order
    const instRes = await request(app).get('/api/installments').query({ filter_status: 'all' });
    const orderInstallments = instRes.body.filter(i => i.order_id === orderId);
    installmentId = orderInstallments[0].installment_id;
  });

  it('should prevent double-charging if the Pay Installment button is double-clicked (Concurrent Duplicate)', async () => {
    // Simulate user clicking "Pay" twice at the exact same millisecond
    const [resA, resB] = await Promise.all([
      request(app).patch(`/api/installments/${installmentId}/pay`).send({ payment_date: '2026-08-01' }),
      request(app).patch(`/api/installments/${installmentId}/pay`).send({ payment_date: '2026-08-01' })
    ]);

    const statuses = [resA.status, resB.status].sort();
    
    // One request should succeed (200 OK)
    // The duplicate request should be safely rejected with 400 (ALREADY_PAID)
    expect(statuses).toEqual([200, 400]);

    const failedRes = resA.status === 400 ? resA : resB;
    expect(failedRes.body.error_code).toBe('ALREADY_PAID');

    // Verify DB state - status should just be 'Paid'
    const dbInst = db.prepare('SELECT status FROM installments WHERE installment_id = ?').get(installmentId);
    expect(dbInst.status).toBe('Paid');
  });

  it('should prevent duplicate actions on sequential requests', async () => {
    // Request 1
    const resA = await request(app).patch(`/api/installments/${installmentId}/pay`).send({ payment_date: '2026-08-01' });
    expect(resA.status).toBe(200);

    // Request 2 (Retry after network drop, or accidental double click delayed)
    const resB = await request(app).patch(`/api/installments/${installmentId}/pay`).send({ payment_date: '2026-08-01' });
    expect(resB.status).toBe(400);
    expect(resB.body.error_code).toBe('ALREADY_PAID');
  });
});
