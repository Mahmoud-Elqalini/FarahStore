const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Installments API', () => {
  describe('POST /api/installments', () => {
    it('should return 410 GONE since endpoint is deprecated', async () => {
      const res = await request(app).post('/api/installments').send({});
      expect(res.status).toBe(410);
      expect(res.body.error_code).toBe('GONE');
    });
  });

  describe('PUT /api/installments/:id', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO installments (installment_id, order_id, installment_number, amount, due_date, status)
        VALUES (1, 1, 1, 500, '2025-01-01', 'Pending')
      `).run();
    });

    it('should return 400 INVALID_STATUS if status is wrong', async () => {
      const res = await request(app).put('/api/installments/1').send({ status: 'Cancelled' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_STATUS');
    });

    it('should return 400 ZERO_OR_NEGATIVE_AMOUNT if amount <= 0', async () => {
      const res = await request(app).put('/api/installments/1').send({ amount: -50 });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ZERO_OR_NEGATIVE_AMOUNT');
    });

    it('should enforce data consistency: payment_date becomes null if status is not Paid', async () => {
      // Setup: Make it Paid first
      db.prepare("UPDATE installments SET status = 'Paid', payment_date = '2025-02-01' WHERE installment_id = 1").run();

      const res = await request(app).put('/api/installments/1').send({ status: 'Pending' }); 
      expect(res.status).toBe(200);

      // Verify DB
      const record = db.prepare('SELECT payment_date FROM installments WHERE installment_id = 1').get();
      expect(record.payment_date).toBeNull();
    });

    it('should keep payment_date if status is Paid', async () => {
      const res = await request(app).put('/api/installments/1').send({ status: 'Paid', payment_date: '2025-03-01' });
      expect(res.status).toBe(200);

      // Verify DB
      const record = db.prepare('SELECT payment_date FROM installments WHERE installment_id = 1').get();
      expect(record.payment_date).toBe('2025-03-01');
    });
  });

  describe('GET /api/installments', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO installments (installment_id, order_id, installment_number, amount, due_date, status)
        VALUES (1, 1, 1, 500, '2025-01-01', 'Pending')
      `).run();
    });

    it('should return all installments', async () => {
      const res = await request(app).get('/api/installments');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('should return 404 for a missing single installment', async () => {
      const res = await request(app).get('/api/installments/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });
});
