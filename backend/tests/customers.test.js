const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Customers API', () => {
  describe('GET /api/customers', () => {
    it('should return all active customers', async () => {
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      res.body.forEach(c => {
        expect(c.is_active).toBe(true);
      });
    });

    it('should return all customers including inactive when include_inactive is true', async () => {
      // First make customer 1 inactive
      db.prepare("UPDATE customers SET is_active = 0 WHERE customer_id = 1").run();
      
      const res = await request(app).get('/api/customers?include_inactive=true');
      expect(res.status).toBe(200);
      const customer = res.body.find(c => c.customer_id === 1);
      expect(customer).toBeDefined();
      expect(customer.is_active).toBe(false);
      
      // Restore customer 1
      db.prepare("UPDATE customers SET is_active = 1 WHERE customer_id = 1").run();
    });
  });

  describe('GET /api/customers/:id', () => {
    it('should return a single customer by id', async () => {
      const res = await request(app).get('/api/customers/1');
      expect(res.status).toBe(200);
      expect(res.body.customer_id).toBe(1);
      expect(res.body).toHaveProperty('customer_name');
      expect(res.body).toHaveProperty('phone');
    });

    it('should return 404 NOT_FOUND if customer does not exist', async () => {
      const res = await request(app).get('/api/customers/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/customers', () => {
    it('should create a new customer with valid data', async () => {
      const uniquePhone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app)
        .post('/api/customers')
        .send({
          customer_name: 'محمود تجريبي ❤️',
          phone: uniquePhone,
          address: 'Tanta, Egypt',
          notes: 'Test notes'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Customer created successfully');
      expect(res.body.data.customer_name).toBe('محمود تجريبي ❤️');
      expect(res.body.data.phone).toBe(uniquePhone);
      expect(res.body.data.is_active).toBe(true);
    });

    it('should return 400 REQUIRED_FIELDS if customer_name or phone is missing or empty', async () => {
      let res = await request(app).post('/api/customers').send({ customer_name: 'Test' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');

      res = await request(app).post('/api/customers').send({ customer_name: '   ', phone: '01012345678' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 INVALID_PHONE if phone format is invalid', async () => {
      const res = await request(app).post('/api/customers').send({ customer_name: 'Test', phone: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_PHONE');
    });

    it('should allow duplicate phone since database has no unique constraint', async () => {
      const phone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      // Create first
      await request(app).post('/api/customers').send({ customer_name: 'First', phone });
      // Create duplicate
      const res = await request(app).post('/api/customers').send({ customer_name: 'Second', phone });
      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/customers/', () => {
    it('should return 400 ID_REQUIRED if ID is missing', async () => {
      const res = await request(app).put('/api/customers/');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ID_REQUIRED');
    });
  });

  describe('PUT /api/customers/:id', () => {
    let testCustomerId;

    beforeEach(async () => {
      const phone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app).post('/api/customers').send({ customer_name: 'Update Target', phone });
      testCustomerId = res.body.data.customer_id;
    });

    it('should update customer with valid data', async () => {
      const newPhone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app)
        .put(`/api/customers/${testCustomerId}`)
        .send({
          customer_name: 'Updated Name',
          phone: newPhone,
          address: 'New Address',
          notes: 'New Notes'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Customer updated successfully');
      expect(res.body.data.customer_name).toBe('Updated Name');
      expect(res.body.data.phone).toBe(newPhone);
    });

    it('should return 400 REQUIRED_FIELDS if fields are empty', async () => {
      const res = await request(app).put(`/api/customers/${testCustomerId}`).send({ customer_name: '', phone: '' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 INVALID_PHONE if phone format is invalid', async () => {
      const res = await request(app).put(`/api/customers/${testCustomerId}`).send({ customer_name: 'Valid Name', phone: '010' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_PHONE');
    });

    it('should return 404 NOT_FOUND if customer ID does not exist', async () => {
      const res = await request(app).put('/api/customers/999').send({ customer_name: 'Valid Name', phone: '01012345678' });
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/customers/', () => {
    it('should return 400 ID_REQUIRED if ID is missing', async () => {
      const res = await request(app).delete('/api/customers/');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ID_REQUIRED');
    });
  });

  describe('DELETE /api/customers/:id', () => {
    let testCustomerId;

    beforeEach(async () => {
      const phone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app).post('/api/customers').send({ customer_name: 'Delete Target', phone });
      testCustomerId = res.body.data.customer_id;
    });

    it('should deactivate (soft delete) customer', async () => {
      const res = await request(app).delete(`/api/customers/${testCustomerId}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Customer deactivated successfully');
      expect(res.body.data.is_active).toBe(false);
    });

    it('should return 404 if customer not found or already inactive', async () => {
      // soft delete first
      await request(app).delete(`/api/customers/${testCustomerId}`);
      // try again
      const res = await request(app).delete(`/api/customers/${testCustomerId}`);
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return 409 CUSTOMER_HAS_OBLIGATIONS if customer has active orders', async () => {
      // First, create an active order for this customer
      db.prepare(`
        INSERT INTO orders (order_id, customer_id, total_amount, payment_type, order_status)
        VALUES (888, ?, 150, 'Cash', 'Active')
      `).run(testCustomerId);

      const res = await request(app).delete(`/api/customers/${testCustomerId}`);
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('CUSTOMER_HAS_OBLIGATIONS');
      
      // Clean up order
      db.prepare("DELETE FROM orders WHERE order_id = 888").run();
    });

    it('should return 409 CUSTOMER_HAS_OBLIGATIONS if customer has unpaid installments', async () => {
      // Create a completed order with unpaid installment
      db.prepare(`
        INSERT INTO orders (order_id, customer_id, total_amount, payment_type, order_status)
        VALUES (889, ?, 150, 'Installment', 'Completed')
      `).run(testCustomerId);

      db.prepare(`
        INSERT INTO installments (order_id, installment_number, amount, due_date, status)
        VALUES (889, 1, 150, '2026-07-01', 'Pending')
      `).run();

      const res = await request(app).delete(`/api/customers/${testCustomerId}`);
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('CUSTOMER_HAS_OBLIGATIONS');

      // Clean up order and installment
      db.prepare("DELETE FROM installments WHERE order_id = 889").run();
      db.prepare("DELETE FROM orders WHERE order_id = 889").run();
    });
  });

  describe('PUT /api/customers/:id/activate', () => {
    let testCustomerId;

    beforeEach(async () => {
      const phone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app).post('/api/customers').send({ customer_name: 'Reactivate Target', phone });
      testCustomerId = res.body.data.customer_id;
      // deactivate it first
      await request(app).delete(`/api/customers/${testCustomerId}`);
    });

    it('should reactivate a deactivated customer', async () => {
      const res = await request(app).put(`/api/customers/${testCustomerId}/activate`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Customer activated successfully');
      expect(res.body.data.is_active).toBe(true);
    });

    it('should return 404 if customer not found or already active', async () => {
      // reactivate first
      await request(app).put(`/api/customers/${testCustomerId}/activate`);
      // try reactivating again
      const res = await request(app).put(`/api/customers/${testCustomerId}/activate`);
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });
});
