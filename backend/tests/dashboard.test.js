const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

describe('Dashboard API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/dashboard', () => {
    it('should return 200 and a valid dashboard structure on empty db scenario', async () => {
      // Mock all 15 promises that dashboard expects with empty results
      pool.query.mockImplementation((query) => {
        if (query.includes('total_sales')) return Promise.resolve({ rows: [{ total_sales: '0', completed_sales: '0' }] });
        if (query.includes('total_customers')) return Promise.resolve({ rows: [{ total_customers: '0' }] });
        if (query.includes('total_products')) return Promise.resolve({ rows: [{ total_products: '0' }] });
        if (query.includes('total_orders')) return Promise.resolve({ rows: [{ total_orders: '0' }] });
        if (query.includes('active_orders')) return Promise.resolve({ rows: [{ active_orders: '0', completed_orders: '0', cancelled_orders: '0' }] });
        if (query.includes('pending_count')) return Promise.resolve({ rows: [{ pending_count: '0', late_count: '0' }] });
        if (query.includes('late_total_amount')) return Promise.resolve({ rows: [{ late_total_amount: '0' }] });
        if (query.includes('total_profit')) return Promise.resolve({ rows: [{ total_profit: '0' }] });
        return Promise.resolve({ rows: [] }); // For arrays (low stock, top selling, etc)
      });

      const res = await request(app).get('/api/dashboard');
      expect(res.status).toBe(200);

      // Verify Summary statistics fields
      expect(res.body).toHaveProperty('counts');
      expect(res.body.counts).toHaveProperty('customers', 0);
      expect(res.body.counts).toHaveProperty('products', 0);
      expect(res.body.counts.orders).toHaveProperty('total', 0);

      // Verify Revenue fields
      expect(res.body).toHaveProperty('sales');
      expect(res.body.sales).toHaveProperty('total', 0);
      expect(res.body.sales).toHaveProperty('profit', 0);

      // Verify Inventory metrics
      expect(res.body).toHaveProperty('lowStockProducts');
      expect(res.body.lowStockProducts).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('topSellingProducts');
      expect(res.body.topSellingProducts).toBeInstanceOf(Array);
    });
  });
});
