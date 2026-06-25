const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Categories API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/categories', () => {
    it('should return all categories', async () => {
      pool.query.mockResolvedValue({ rows: [{ category_id: 1, category_name: 'Electronics', product_count: 5 }] });
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/categories/:id', () => {
    it('should return 404 NOT_FOUND if category does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      const res = await request(app).get('/api/categories/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return category data if exists', async () => {
      pool.query.mockResolvedValue({ rows: [{ category_id: 1, category_name: 'Electronics' }] });
      const res = await request(app).get('/api/categories/1');
      expect(res.status).toBe(200);
      expect(res.body.category_name).toBe('Electronics');
    });
  });

  describe('POST /api/categories', () => {
    it('should return 400 REQUIRED_FIELDS if category_name is missing', async () => {
      const res = await request(app).post('/api/categories').send({});
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should create a new category successfully', async () => {
      pool.query.mockResolvedValue({ rows: [{ category_id: 1, category_name: 'New Category' }] });
      const res = await request(app).post('/api/categories').send({ category_name: 'New Category' });
      expect(res.status).toBe(201);
      expect(res.body.category_name).toBe('New Category');
    });
  });

  describe('PUT /api/categories/', () => {
    it('should return 400 ID_REQUIRED if ID is missing', async () => {
      const res = await request(app).put('/api/categories/');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ID_REQUIRED');
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('should return 400 REQUIRED_FIELDS if category_name is missing', async () => {
      const res = await request(app).put('/api/categories/1').send({});
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 404 NOT_FOUND if category to update does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] }); // Update returns empty
      const res = await request(app).put('/api/categories/999').send({ category_name: 'Updated' });
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/categories/', () => {
    it('should return 400 ID_REQUIRED if ID is missing', async () => {
      const res = await request(app).delete('/api/categories/');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('ID_REQUIRED');
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('should return 404 NOT_FOUND if category does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      const res = await request(app).delete('/api/categories/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return 400 LINKED_RECORDS_EXIST if category is linked to products', async () => {
      const dbError = new Error();
      dbError.code = '23503';
      pool.query.mockRejectedValue(dbError);

      const res = await request(app).delete('/api/categories/1');
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('LINKED_RECORDS_EXIST');
    });

    it('should delete category successfully', async () => {
      pool.query.mockResolvedValue({ rows: [{ category_id: 1 }] });
      const res = await request(app).delete('/api/categories/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Category deleted');
    });
  });
});
