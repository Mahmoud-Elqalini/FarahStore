const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

describe('End-to-End Workflow', () => {
  let categoryId, supplierId, productId, customerId, orderId, installmentId;

  afterAll(async () => {
    // Cleanup everything created in this test
    await pool.query('DELETE FROM installments');
    await pool.query('DELETE FROM order_details');
    await pool.query('DELETE FROM orders');
    await pool.query('DELETE FROM customers WHERE customer_id = $1', [customerId]);
    await pool.query('DELETE FROM products WHERE product_id = $1', [productId]);
    await pool.query('DELETE FROM suppliers WHERE supplier_id = $1', [supplierId]);
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]);
    await pool.end();
  });

  it('Step 1: Create Category', async () => {
    const res = await request(app).post('/api/categories').send({ category_name: 'E2E Category' });
    expect(res.status).toBe(201);
    categoryId = res.body.category_id;
  });

  it('Step 2: Create Supplier', async () => {
    const res = await request(app).post('/api/suppliers').send({ supplier_name: 'E2E Supplier', phone: '1234567890' });
    expect(res.status).toBe(201);
    supplierId = res.body.data.supplier_id;
  });

  it('Step 3: Create Product', async () => {
    const res = await request(app).post('/api/products').send({
      product_name: 'E2E Product',
      purchase_price: 100,
      selling_price: 200,
      stock_quantity: 50,
      category_id: categoryId,
      supplier_id: supplierId
    });
    expect(res.status).toBe(201);
    productId = res.body.data.product_id;
  });

  it('Step 4: Create Customer', async () => {
    const res = await request(app).post('/api/customers').send({
      customer_name: 'E2E Customer',
      phone: '0987654321'
    });
    expect(res.status).toBe(201);
    customerId = res.body.data.customer_id;
  });

  it('Step 5: Create Installment Order', async () => {
    const res = await request(app).post('/api/orders').send({
      customer_id: customerId,
      payment_type: 'Installment',
      months: 2,
      first_due_date: '2030-01-01',
      items: [
        { product_id: productId, quantity: 2, unit_price: 200 }
      ]
    });
    if (res.status !== 201) console.log('ORDER FAILURE:', res.body);
    expect(res.status).toBe(201);
    orderId = res.body.order_id || res.body.create_order || res.body.id;
  });

  it('Step 6: Fetch Installments', async () => {
    const res = await request(app).get(`/api/installments/order/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    installmentId = res.body[0].installment_id;
  });

  it('Step 7: Mark one Installment as Paid', async () => {
    const res = await request(app).patch(`/api/installments/${installmentId}/pay`).send();
    expect(res.status).toBe(200);
  });

  it('Step 8: Attempt deleting Customer (Should fail with CUSTOMER_HAS_OBLIGATIONS)', async () => {
    const res = await request(app).delete(`/api/customers/${customerId}`);
    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('CUSTOMER_HAS_OBLIGATIONS');
  });

  it('Step 9: Delete Product (Soft Delete success)', async () => {
    const res = await request(app).delete(`/api/products/${productId}`);
    expect(res.status).toBe(200);
  });

  it('Step 10: Verify Category and Supplier deletion rules', async () => {
    // Both Category and Supplier CAN be deleted because it checks for ACTIVE products only (which we just soft deleted)
    const resCat = await request(app).delete(`/api/categories/${categoryId}`);
    expect(resCat.status).toBe(200);

    // Supplier CAN be deleted because it checks for ACTIVE products only (which we just soft deleted)
    const resSup = await request(app).delete(`/api/suppliers/${supplierId}`);
    expect(resSup.status).toBe(200);
  });
});
