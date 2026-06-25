const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Suppliers API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/suppliers', () => {
    it('should return 400 REQUIRED_FIELDS if supplier_name is missing', async () => {
      const res = await request(app).post('/api/suppliers').send({ phone: '1234567890' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should create supplier successfully', async () => {
      pool.query.mockResolvedValue({ rows: [{ supplier_id: 1, supplier_name: 'Supplier A' }] });
      const res = await request(app).post('/api/suppliers').send({ supplier_name: 'Supplier A' });
      expect(res.status).toBe(201);
      expect(res.body.data.supplier_id).toBe(1);
    });
  });

  describe('PUT /api/suppliers/', () => {
    it('should return 400 ID_REQUIRED if ID is missing', async () => {
      const res = await request(app).put('/api/suppliers/');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ID_REQUIRED');
    });
  });

  describe('PUT /api/suppliers/:id', () => {
    it('should return 404 NOT_FOUND if supplier does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      const res = await request(app).put('/api/suppliers/999').send({ supplier_name: 'Updated' });
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/suppliers/', () => {
    it('should return 400 ID_REQUIRED if ID is missing', async () => {
      const res = await request(app).delete('/api/suppliers/');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ID_REQUIRED');
    });
  });

  describe('DELETE /api/suppliers/:id', () => {
    it('should return 404 NOT_FOUND if supplier does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      const res = await request(app).delete('/api/suppliers/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return 400 LINKED_RECORDS_EXIST if supplier is linked to products', async () => {
      const dbError = new Error();
      dbError.code = '23503';
      pool.query.mockRejectedValue(dbError);

      const res = await request(app).delete('/api/suppliers/1');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('LINKED_RECORDS_EXIST');
    });
  });
});
