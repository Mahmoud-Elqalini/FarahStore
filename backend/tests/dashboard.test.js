const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Dashboard API', () => {
  describe('GET /api/dashboard', () => {
    it('should return 200 and valid dashboard structure matching global seed', async () => {
      const res = await request(app).get('/api/dashboard');
      expect(res.status).toBe(200);

      // Verify Summary statistics fields based on global setup.js seed
      // Customers: 1
      // Products: 1
      // Orders: 1
      expect(res.body).toHaveProperty('counts');
      expect(res.body.counts).toHaveProperty('customers', 1);
      expect(res.body.counts).toHaveProperty('products', 1);
      expect(res.body.counts.orders).toHaveProperty('total', 1);

      // Verify Revenue fields
      // Seed Order 1: 150 total amount
      expect(res.body).toHaveProperty('sales');
      expect(res.body.sales).toHaveProperty('total', 150);
      // Profit = (selling - purchase) * qty = (150 - 100) * 1 = 50
      expect(res.body.sales).toHaveProperty('profit', 50);

      // Verify Inventory metrics
      expect(res.body).toHaveProperty('lowStockProducts');
      expect(res.body.lowStockProducts).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('topSellingProducts');
      expect(res.body.topSellingProducts).toBeInstanceOf(Array);
    });
  });
});
