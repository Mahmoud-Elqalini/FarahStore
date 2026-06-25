const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Orders API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/orders', () => {
    const validOrder = {
      p_customer_id: 1,
      p_payment_type: 'Cash',
      p_total_amount: 500,
      p_items: [
        { product_id: 1, quantity: 2, unit_price: 250 }
      ]
    };

    it('should return 400 REQUIRED_FIELDS if missing payload fields', async () => {
      const res = await request(app).post('/api/orders').send({});
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 ZERO_OR_NEGATIVE_AMOUNT if order total <= 0', async () => {
      const payload = { ...validOrder, p_total_amount: 0 };
      const res = await request(app).post('/api/orders').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ZERO_OR_NEGATIVE_AMOUNT');
    });

    it('should return 400 INVALID_PAYMENT_TYPE if payment type is wrong', async () => {
      const payload = { ...validOrder, p_payment_type: 'Bitcoin' };
      const res = await request(app).post('/api/orders').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_PAYMENT_TYPE');
    });

    it('should return 400 AMOUNT_MISMATCH if total amount does not equal sum of items', async () => {
      pool.query.mockRejectedValue(new Error('Total amount mismatch'));

      const res = await request(app).post('/api/orders').send(validOrder);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('AMOUNT_MISMATCH');
    });

    it('should return 400 FK_NOT_EXISTS if customer_id does not exist', async () => {
      const dbError = new Error();
      dbError.code = '23503';
      pool.query.mockRejectedValue(dbError);

      const res = await request(app).post('/api/orders').send(validOrder);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('FK_NOT_EXISTS');
    });
  });

  describe('PUT /api/orders/:id', () => {
    it('should return 404 NOT_FOUND if order does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      const res = await request(app).put('/api/orders/999').send({ total_amount: 100 });
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });
});
