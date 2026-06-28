const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Products API', () => {
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
      const res = await request(app).post('/api/products').send(validProduct);
      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.sku).not.toBeNull();
      expect(res.body.data.sku).toMatch(/^\d{2}-\d{4}$/);
    });
  });

  describe('POST /api/products/:id/restock', () => {
    it('should return 400 INACTIVE_PRODUCT if product is inactive', async () => {
      // Setup: Deactivate product first
      db.prepare("UPDATE products SET is_active = 0 WHERE product_id = 1").run();

      const res = await request(app)
        .post('/api/products/1/restock')
        .send({ quantity: 10, purchase_price: 90 });
        
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INACTIVE_PRODUCT');
    });

    it('should restock successfully and return WAC price', async () => {
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
      const res = await request(app).delete('/api/products/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Product deactivated successfully');
    });
  });

  describe('PUT /api/products/:id/activate', () => {
    it('should activate product', async () => {
      // Setup: Deactivate product first so it can be activated
      db.prepare("UPDATE products SET is_active = 0 WHERE product_id = 1").run();

      const res = await request(app).put('/api/products/1/activate');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Product activated successfully');
    });
  });
});
