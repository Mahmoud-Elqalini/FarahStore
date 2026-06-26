const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn()
  };
  return {
    query: jest.fn(),
    connect: jest.fn(() => mClient)
  };
});

describe('Orders API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/orders', () => {
    const validOrder = {
      customer_id: 1,
      payment_type: 'Cash',
      items: [
        { product_id: 1, quantity: 2, unit_price: 250 }
      ]
    };

    it('should return 400 REQUIRED_FIELDS if missing payload fields', async () => {
      const res = await request(app).post('/api/orders').send({});
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 INVALID_PAYMENT_TYPE if payment type is wrong', async () => {
      const payload = { ...validOrder, payment_type: 'Bitcoin' };
      const res = await request(app).post('/api/orders').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_PAYMENT_TYPE');
    });

    it('should return 400 NOT_FOUND if customer_id does not exist', async () => {
      const client = await pool.connect();
      client.query.mockResolvedValueOnce({ rowCount: 0 }); // Mock customer validation

      const res = await request(app).post('/api/orders').send(validOrder);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('NOT_FOUND');
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
