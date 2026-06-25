const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Products API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/products', () => {
    const validProduct = {
      product_name: 'Test Product',
      purchase_price: 100,
      selling_price: 150,
      stock_quantity: 10,
      category_id: 1,
      supplier_id: 1,
      barcode: '123456789'
    };

    it('should return 400 REQUIRED_FIELDS if required fields are missing', async () => {
      const res = await request(app).post('/api/products').send({ product_name: 'Test' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 NEGATIVE_VALUE if purchase_price <= 0', async () => {
      const payload = { ...validProduct, purchase_price: 0 };
      const res = await request(app).post('/api/products').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('NEGATIVE_VALUE');
    });

    it('should create product and return SKU matching regex', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          ...validProduct,
          product_id: 1,
          sku: '01-0001',
          is_active: true
        }]
      });

      const res = await request(app).post('/api/products').send(validProduct);
      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.sku).not.toBeNull();
      expect(res.body.data.sku).toMatch(/^\d{2}-\d{4}$/);
    });
  });

  describe('POST /api/products/:id/restock', () => {
    it('should return 400 INACTIVE_PRODUCT if product is inactive', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ is_active: false }] }); // check active

      const res = await request(app)
        .post('/api/products/1/restock')
        .send({ quantity: 10, purchase_price: 90 });
        
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INACTIVE_PRODUCT');
    });

    it('should restock successfully and return WAC price', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // check active
      pool.query.mockResolvedValueOnce({
        rows: [{
          product_id: 1,
          stock_quantity: 20,
          purchase_price: 95.00,
          selling_price: 150.00
        }]
      }); // restock_product result

      const res = await request(app)
        .post('/api/products/1/restock')
        .send({ quantity: 10, purchase_price: 90 });
        
      expect(res.status).toBe(200);
      expect(res.body.data.stock_quantity).toBe(20);
      expect(res.body.data.purchase_price).toBe(95.00);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should ignore sku in payload and update barcode', async () => {
      const existingProduct = {
        product_id: 1,
        product_name: 'Old Name',
        purchase_price: 100,
        selling_price: 150,
        stock_quantity: 10,
        category_id: 1,
        supplier_id: 1,
        barcode: '111',
        sku: '01-0001',
        is_active: true
      };

      pool.query.mockResolvedValueOnce({ rows: [existingProduct] }); // fetch existing
      pool.query.mockResolvedValueOnce({ rows: [] }); // barcode check
      pool.query.mockResolvedValueOnce({
        rows: [{
          ...existingProduct,
          barcode: '222',
          sku: '01-0001' // sku unchanged
        }]
      }); // update result

      const res = await request(app)
        .put('/api/products/1')
        .send({ barcode: '222', sku: '99-9999' }); // malicious sku

      expect(res.status).toBe(200);
      expect(res.body.data.barcode).toBe('222');
      expect(res.body.data.sku).toBe('01-0001'); // Ensure it didn't change in response
    });
  });

  describe('DELETE /api/products/:id (Deactivate)', () => {
    it('should deactivate product (Soft Delete)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ product_id: 1, is_active: false }] });

      const res = await request(app).delete('/api/products/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Product deactivated successfully');
    });
  });

  describe('PUT /api/products/:id/activate', () => {
    it('should activate product', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ product_id: 1, is_active: true }] });

      const res = await request(app).put('/api/products/1/activate');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Product activated successfully');
    });
  });
});
