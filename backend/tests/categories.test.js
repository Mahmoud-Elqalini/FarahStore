const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Categories API', () => {
  describe('GET /api/categories', () => {
    it('should return all categories', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/categories/:id', () => {
    it('should return 404 NOT_FOUND if category does not exist', async () => {
      const res = await request(app).get('/api/categories/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return category data if exists', async () => {
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
      const res = await request(app).delete('/api/categories/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return 409 LINKED_RECORDS_EXIST if category is linked to products', async () => {
      const res = await request(app).delete('/api/categories/1');
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('CATEGORY_IN_USE');
    });

    it('should delete category successfully', async () => {
      // Setup: deactivate the product linked to this category first so it can be deleted
      db.prepare("UPDATE products SET is_active = 0 WHERE product_id = 1").run();

      const res = await request(app).delete('/api/categories/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Category deactivated successfully');
    });
  });
});
