const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

describe('Suppliers API', () => {
  describe('GET /api/suppliers', () => {
    it('should return all active suppliers', async () => {
      const res = await request(app).get('/api/suppliers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      res.body.forEach(s => {
        expect(s.is_active).toBe(true);
      });
    });

    it('should return all suppliers including inactive when include_inactive is true', async () => {
      // First create a deactivated supplier
      const uniquePhone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const tempSupplier = await request(app).post('/api/suppliers').send({ supplier_name: 'Temp Supplier', phone: uniquePhone });
      const tempId = tempSupplier.body.data.supplier_id;
      
      // Deactivate it
      await request(app).delete(`/api/suppliers/${tempId}`);
      
      const res = await request(app).get('/api/suppliers?include_inactive=true');
      expect(res.status).toBe(200);
      const supplier = res.body.find(s => s.supplier_id === tempId);
      expect(supplier).toBeDefined();
      expect(supplier.is_active).toBe(false);
    });
  });

  describe('GET /api/suppliers/:id', () => {
    it('should return a single supplier by id', async () => {
      const res = await request(app).get('/api/suppliers/1');
      expect(res.status).toBe(200);
      expect(res.body.supplier_id).toBe(1);
      expect(res.body.is_active).toBe(true);
    });

    it('should return 404 NOT_FOUND if supplier does not exist', async () => {
      const res = await request(app).get('/api/suppliers/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/suppliers', () => {
    it('should return 400 REQUIRED_FIELDS if supplier_name is missing or empty', async () => {
      let res = await request(app).post('/api/suppliers').send({ phone: '01123456789' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');

      res = await request(app).post('/api/suppliers').send({ supplier_name: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 INVALID_PHONE if phone format is invalid', async () => {
      const res = await request(app).post('/api/suppliers').send({ supplier_name: 'Supplier Name', phone: '12345' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_PHONE');
    });

    it('should create supplier successfully with valid data', async () => {
      const uniquePhone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app)
        .post('/api/suppliers')
        .send({
          supplier_name: 'Supplier Created',
          phone: uniquePhone,
          address: 'Supplier Address',
          notes: 'Supplier Notes'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.data.supplier_name).toBe('Supplier Created');
      expect(res.body.data.phone).toBe(uniquePhone);
      expect(res.body.data.is_active).toBe(true);
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
    let testSupplierId;

    beforeEach(async () => {
      const phone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app).post('/api/suppliers').send({ supplier_name: 'Update Target', phone });
      testSupplierId = res.body.data.supplier_id;
    });

    it('should update supplier successfully with valid data', async () => {
      const newPhone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app)
        .put(`/api/suppliers/${testSupplierId}`)
        .send({
          supplier_name: 'Updated Supplier Name',
          phone: newPhone,
          address: 'New Supplier Address',
          notes: 'New Supplier Notes'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Supplier updated successfully');
      expect(res.body.data.supplier_name).toBe('Updated Supplier Name');
      expect(res.body.data.phone).toBe(newPhone);
    });

    it('should return 400 REQUIRED_FIELDS if supplier_name is empty', async () => {
      const res = await request(app).put(`/api/suppliers/${testSupplierId}`).send({ supplier_name: '' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('REQUIRED_FIELDS');
    });

    it('should return 400 INVALID_PHONE if phone format is invalid', async () => {
      const res = await request(app).put(`/api/suppliers/${testSupplierId}`).send({ supplier_name: 'Valid Name', phone: '010' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_PHONE');
    });

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
    let testSupplierId;

    beforeEach(async () => {
      const phone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app).post('/api/suppliers').send({ supplier_name: 'Delete Target', phone });
      testSupplierId = res.body.data.supplier_id;
    });

    it('should deactivate (soft delete) supplier successfully', async () => {
      const res = await request(app).delete(`/api/suppliers/${testSupplierId}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Supplier deactivated successfully');
      expect(res.body.data.is_active).toBe(false);
    });

    it('should return 404 NOT_FOUND if supplier does not exist', async () => {
      const res = await request(app).delete('/api/suppliers/999');
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return 404 NOT_FOUND if supplier is already inactive', async () => {
      // Deactivate first
      await request(app).delete(`/api/suppliers/${testSupplierId}`);
      // Deactivate again
      const res = await request(app).delete(`/api/suppliers/${testSupplierId}`);
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });

    it('should return 409 SUPPLIER_IN_USE if supplier has active products', async () => {
      const res = await request(app).delete('/api/suppliers/1');
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('SUPPLIER_IN_USE');
    });
  });

  describe('PUT /api/suppliers/:id/activate', () => {
    let testSupplierId;

    beforeEach(async () => {
      const phone = '01' + Math.floor(100000000 + Math.random() * 900000000);
      const res = await request(app).post('/api/suppliers').send({ supplier_name: 'Reactivate Target', phone });
      testSupplierId = res.body.data.supplier_id;
      // deactivate it first
      await request(app).delete(`/api/suppliers/${testSupplierId}`);
    });

    it('should reactivate a deactivated supplier', async () => {
      const res = await request(app).put(`/api/suppliers/${testSupplierId}/activate`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Supplier activated successfully');
      expect(res.body.data.is_active).toBe(true);
    });

    it('should return 404 if supplier not found or already active', async () => {
      // reactivate first
      await request(app).put(`/api/suppliers/${testSupplierId}/activate`);
      // try reactivating again
      const res = await request(app).put(`/api/suppliers/${testSupplierId}/activate`);
      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('NOT_FOUND');
    });
  });
});
