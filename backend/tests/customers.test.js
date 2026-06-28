const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Customers API', () => {
  describe('POST /api/customers', () => {
    it('should return 400 REQUIRED_FIELDS if customer_name or phone is missing', async () => {
      const res = await request(app).post('/api/customers').send({ customer_name: 'Test' }); // missing phone
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });
  });

  describe('PUT /api/customers/', () => {
    it('should return 400 ID_REQUIRED if ID is missing', async () => {
      const res = await request(app).put('/api/customers/');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ID_REQUIRED');
    });
  });

  describe('GET /api/customers/:id', () => {
    it('should return 404 NOT_FOUND if customer does not exist', async () => {
      const res = await request(app).get('/api/customers/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('should return 409 CUSTOMER_HAS_OBLIGATIONS if customer has active orders', async () => {
      // First, create an active order for this customer
      db.prepare(`
        INSERT INTO orders (order_id, customer_id, total_amount, payment_type, order_status)
        VALUES (999, 1, 150, 'Cash', 'Active')
      `).run();

      const res = await request(app).delete('/api/customers/1');
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('CUSTOMER_HAS_OBLIGATIONS');
    });
  });
});
