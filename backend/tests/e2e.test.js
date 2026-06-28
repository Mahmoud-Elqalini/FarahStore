const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('End-to-End Workflow', () => {
  it('should run the entire E2E workflow successfully', async () => {
    let categoryId, supplierId, productId, customerId, orderId, installmentId;

    // Step 1: Create Category
    const catRes = await request(app).post('/api/categories').send({ category_name: 'E2E Category' });
    expect(catRes.status).toBe(201);
    categoryId = catRes.body.category_id;

    // Step 2: Create Supplier
    const supRes = await request(app).post('/api/suppliers').send({ supplier_name: 'E2E Supplier', phone: '01123456789' });
    expect(supRes.status).toBe(201);
    supplierId = supRes.body.data.supplier_id;

    // Step 3: Create Product
    const prodRes = await request(app).post('/api/products').send({
      product_name: 'E2E Product',
      purchase_price: 100,
      selling_price: 200,
      stock_quantity: 50,
      category_id: categoryId,
      supplier_id: supplierId
    });
    expect(prodRes.status).toBe(201);
    productId = prodRes.body.data.product_id;

    // Step 4: Create Customer
    const custRes = await request(app).post('/api/customers').send({
      customer_name: 'E2E Customer',
      phone: '01987654321'
    });
    expect(custRes.status).toBe(201);
    customerId = custRes.body.data.customer_id;

    // Step 5: Create Installment Order
    const orderRes = await request(app).post('/api/orders').send({
      customer_id: customerId,
      payment_type: 'Installment',
      months: 2,
      first_due_date: '2030-01-01',
      items: [
        { product_id: productId, quantity: 2, unit_price: 200 }
      ]
    });
    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.order_id || orderRes.body.create_order || orderRes.body.id;

    // Step 6: Fetch Installments
    const instRes = await request(app).get(`/api/installments/order/${orderId}`);
    expect(instRes.status).toBe(200);
    expect(instRes.body.length).toBe(2);
    installmentId = instRes.body[0].installment_id;

    // Step 7: Mark one Installment as Paid
    const payRes = await request(app).patch(`/api/installments/${installmentId}/pay`).send();
    expect(payRes.status).toBe(200);

    // Step 8: Attempt deleting Customer (Should fail with CUSTOMER_HAS_OBLIGATIONS)
    const delCustRes = await request(app).delete(`/api/customers/${customerId}`);
    expect(delCustRes.status).toBe(409); 
    expect(delCustRes.body.error_code).toBe('CUSTOMER_HAS_OBLIGATIONS');

    // Step 9: Delete Product (Soft Delete success)
    const delProdRes = await request(app).delete(`/api/products/${productId}`);
    expect(delProdRes.status).toBe(200);

    // Step 10: Verify Category and Supplier deletion rules
    // Both Category and Supplier CAN be deleted because it checks for ACTIVE products only (which we just soft deleted)
    const delCatRes = await request(app).delete(`/api/categories/${categoryId}`);
    expect(delCatRes.status).toBe(200);

    const delSupRes = await request(app).delete(`/api/suppliers/${supplierId}`);
    expect(delSupRes.status).toBe(200);
  });
});
