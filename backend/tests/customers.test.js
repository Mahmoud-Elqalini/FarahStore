const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Customers API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

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
      pool.query.mockResolvedValue({ rows: [] });
      const res = await request(app).get('/api/customers/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('should return 400 LINKED_RECORDS_EXIST if customer has orders', async () => {
      const dbError = new Error();
      dbError.code = '23503';
      pool.query.mockRejectedValue(dbError);

      const res = await request(app).delete('/api/customers/1');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('LINKED_RECORDS_EXIST');
    });
  });
});
