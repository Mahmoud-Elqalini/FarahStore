const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Suppliers API', () => {
  describe('POST /api/suppliers', () => {
    it('should return 400 REQUIRED_FIELDS if supplier_name is missing', async () => {
      const res = await request(app).post('/api/suppliers').send({ phone: '01123456789' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should create supplier successfully', async () => {
      const res = await request(app).post('/api/suppliers').send({ supplier_name: 'Supplier A' });
      expect(res.status).toBe(201);
      expect(res.body.data.supplier_id).toBeDefined();
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
      const res = await request(app).delete('/api/suppliers/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return 409 SUPPLIER_IN_USE if supplier has active products', async () => {
      const res = await request(app).delete('/api/suppliers/1');
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('SUPPLIER_IN_USE');
    });
  });
});
