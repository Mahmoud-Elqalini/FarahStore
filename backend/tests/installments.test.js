const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Installments API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/installments', () => {
    it('should return 400 REQUIRED_FIELDS if fields are missing', async () => {
      const res = await request(app).post('/api/installments').send({});
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 ZERO_OR_NEGATIVE_AMOUNT if p_months <= 0', async () => {
      const res = await request(app).post('/api/installments').send({ p_order_id: 1, p_months: 0, p_first_due_date: '2025-01-01' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ZERO_OR_NEGATIVE_AMOUNT');
    });

    it('should return 400 FK_NOT_EXISTS if order_id is invalid', async () => {
      const dbError = new Error();
      dbError.code = '23503';
      pool.query.mockRejectedValue(dbError);

      const res = await request(app).post('/api/installments').send({ p_order_id: 999, p_months: 5, p_first_due_date: '2025-01-01' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('FK_NOT_EXISTS');
    });
  });

  describe('PUT /api/installments/:id', () => {
    const existingRow = { installment_id: 1, amount: 500, due_date: '2025-01-01', payment_date: null, status: 'Pending' };

    it('should return 400 INVALID_STATUS if status is wrong', async () => {
      pool.query.mockResolvedValueOnce({ rows: [existingRow] }); // Fetch check passes
      
      const res = await request(app).put('/api/installments/1').send({ status: 'Cancelled' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_STATUS');
    });

    it('should return 400 ZERO_OR_NEGATIVE_AMOUNT if amount <= 0', async () => {
      pool.query.mockResolvedValueOnce({ rows: [existingRow] });
      
      const res = await request(app).put('/api/installments/1').send({ amount: -50 });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ZERO_OR_NEGATIVE_AMOUNT');
    });

    it('should enforce data consistency: payment_date becomes null if status is not Paid', async () => {
      // Suppose existing row is Paid and has a payment_date
      const paidRow = { ...existingRow, status: 'Paid', payment_date: '2025-02-01' };
      pool.query.mockResolvedValueOnce({ rows: [paidRow] }); // fetch
      pool.query.mockResolvedValueOnce({ rows: [{ ...paidRow, status: 'Pending', payment_date: null }] }); // update returning

      const res = await request(app).put('/api/installments/1').send({ status: 'Pending' }); // User just changes status
      
      expect(res.status).toBe(200);
      // Ensure the query passed null to the database
      expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE installments'), [500, '2025-01-01', null, 'Pending', "1"]);
    });

    it('should keep payment_date if status is Paid', async () => {
      pool.query.mockResolvedValueOnce({ rows: [existingRow] }); // fetch
      pool.query.mockResolvedValueOnce({ rows: [{ ...existingRow, status: 'Paid', payment_date: '2025-03-01' }] }); // update returning

      const res = await request(app).put('/api/installments/1').send({ status: 'Paid', payment_date: '2025-03-01' });
      
      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE installments'), [500, '2025-01-01', '2025-03-01', 'Paid', "1"]);
    });
  });

  describe('GET /api/installments', () => {
    it('should return all installments', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ installment_id: 1, amount: 500 }] });
      const res = await request(app).get('/api/installments');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('should return 404 for a missing single installment', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/installments/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });
});
