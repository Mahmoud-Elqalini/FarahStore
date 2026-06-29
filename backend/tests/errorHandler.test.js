const errorHandler = require('../middleware/errorHandler');

describe('Global Error Handler Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  it('should handle SQLITE_CONSTRAINT_FOREIGNKEY on non-DELETE requests', () => {
    mockReq.method = 'POST';
    const err = { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' };
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'FK_NOT_EXISTS' })
    );
  });

  it('should handle SQLITE_CONSTRAINT_FOREIGNKEY on DELETE requests', () => {
    mockReq.method = 'DELETE';
    const err = { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' };
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'LINKED_RECORDS_EXIST' })
    );
  });

  it('should handle SQLITE_CONSTRAINT_UNIQUE for category_name', () => {
    const err = { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'UNIQUE constraint failed: categories.category_name' };
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'DUPLICATE_RECORD', error: 'Category name already exists.' })
    );
  });

  it('should handle SQLITE_CONSTRAINT_UNIQUE for barcode', () => {
    const err = { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'UNIQUE constraint failed: products.barcode' };
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'DUPLICATE_BARCODE' })
    );
  });

  it('should handle SQLITE_CONSTRAINT_UNIQUE generic fallback', () => {
    const err = { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'UNIQUE constraint failed: other_table.other_field' };
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'DUPLICATE_RECORD', error: 'Record already exists.' })
    );
  });

  it('should handle SQLITE_CONSTRAINT_CHECK for stock_quantity', () => {
    const err = { code: 'SQLITE_CONSTRAINT_CHECK', message: 'CHECK constraint failed: stock_quantity >= 0' };
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'INSUFFICIENT_STOCK' })
    );
  });

  it('should handle SQLITE_CONSTRAINT_CHECK generic fallback', () => {
    const err = { code: 'SQLITE_CONSTRAINT_CHECK', message: 'CHECK constraint failed: other_check' };
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'ZERO_OR_NEGATIVE_AMOUNT' })
    );
  });

  it('should fallback to 500 SERVER_ERROR for generic unexpected errors', () => {
    const err = new Error('Some unexpected generic database error');
    
    errorHandler(err, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error_code: 'SERVER_ERROR',
      error: 'Internal Server Error'
    });
  });
});
