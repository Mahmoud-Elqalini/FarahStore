const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

// In an E2E test, we actually test against a real Test Database
// No mocking is applied here to verify foreign keys and linked-record protections.

describe('End-to-End Workflow', () => {
  let categoryId;
  let supplierId;
  let productId;
  let customerId;
  let orderId;
  let installmentId;

  beforeAll(async () => {
    // Optional Setup
  });

  afterAll(async () => {
    // Teardown: ensure DB connections are closed and data is wiped securely
    if (orderId) {
      await pool.query('DELETE FROM installments WHERE order_id = $1', [orderId]);
      await pool.query('DELETE FROM order_details WHERE order_id = $1', [orderId]);
      await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    }
    if (customerId) await pool.query('DELETE FROM customers WHERE customer_id = $1', [customerId]);
    if (productId) await pool.query('DELETE FROM products WHERE product_id = $1', [productId]);
    if (supplierId) await pool.query('DELETE FROM suppliers WHERE supplier_id = $1', [supplierId]);
    if (categoryId) await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]);
    
    await pool.end();
  });

  it('Step 1: Create Category', async () => {
    const res = await request(app).post('/api/categories').send({ category_name: 'E2E Category' });
    if (res.status !== 201) console.log("STEP 1 ERROR:", res.body);
    expect(res.status).toBe(201);
    categoryId = res.body.category_id;
    expect(categoryId).toBeDefined();
  });

  it('Step 2: Create Supplier', async () => {
    const res = await request(app).post('/api/suppliers').send({ 
      supplier_name: 'E2E Supplier',
      phone: '0123456789'
    });
    expect(res.status).toBe(201);
    supplierId = res.body.data.supplier_id;
    expect(supplierId).toBeDefined();
  });

  it('Step 3: Create Product linked to the Category and Supplier', async () => {
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
    expect(productId).toBeDefined();
  });

  it('Step 4: Create Customer', async () => {
    const res = await request(app).post('/api/customers').send({
      customer_name: 'E2E Customer',
      phone: '0987654321'
    });
    expect(res.status).toBe(201);
    customerId = res.body.data.customer_id;
    expect(customerId).toBeDefined();
  });

  it('Step 5: Create Order using the Product and Customer', async () => {
    const res = await request(app).post('/api/orders').send({
      p_customer_id: customerId,
      p_payment_type: 'Installment',
      p_total_amount: 400,
      p_items: [
        { product_id: productId, quantity: 2, unit_price: 200 }
      ]
    });
    expect(res.status).toBe(201);
    expect(res.body).toBeDefined();
    expect(res.body.data).toBeDefined();

    // The create_order postgres function returns the ID in the 'create_order' property 
    // instead of 'order_id' when returning a scalar result set
    orderId = res.body.data.order_id || res.body.data.create_order || res.body.data.id;
    expect(orderId).toBeDefined();
  });

  it('Step 6: Generate Installments for the Order', async () => {
    const res = await request(app).post('/api/installments').send({
      p_order_id: orderId,
      p_months: 2,
      p_first_due_date: '2025-01-01'
    });
    expect(res.status).toBe(201);
  });

  it('Step 7: Fetch Installments', async () => {
    const res = await request(app).get(`/api/installments/order/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    installmentId = res.body[0].installment_id;
  });

  it('Step 8: Mark one Installment as Paid', async () => {
    const res = await request(app).put(`/api/installments/${installmentId}`).send({
      status: 'Paid',
      payment_date: '2024-12-01'
    });
    expect(res.status).toBe(200);
  });

  it('Step 9: Verify installment status changed successfully', async () => {
    const res = await request(app).get(`/api/installments/${installmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Paid');
  });

  it('Step 10: Attempt deleting Customer (Should fail with LINKED_RECORDS_EXIST)', async () => {
    const res = await request(app).delete(`/api/customers/${customerId}`);
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('LINKED_RECORDS_EXIST');
  });

  it('Step 11: Attempt deleting Product (Should fail with LINKED_RECORDS_EXIST)', async () => {
    const res = await request(app).delete(`/api/products/${productId}`);
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('LINKED_RECORDS_EXIST');
  });

  it('Step 12: Verify all linked-record protection rules work correctly for categories & suppliers', async () => {
    const resCat = await request(app).delete(`/api/categories/${categoryId}`);
    expect(resCat.status).toBe(400);
    expect(resCat.body.error_code).toBe('LINKED_RECORDS_EXIST');

    const resSup = await request(app).delete(`/api/suppliers/${supplierId}`);
    expect(resSup.status).toBe(400);
    expect(resSup.body.error_code).toBe('LINKED_RECORDS_EXIST');
  });
});
