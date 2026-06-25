/**
 * Global Error Handler Middleware
 * Intercepts errors and standardizes the response without leaking DB internals.
 */
function errorHandler(err, req, res, next) {
  // Only log detailed errors in development/backend console, not to the client
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[GlobalErrorHandler] Error caught:`, err);
  }

  // 1. Handle Custom Database Exceptions (RAISE EXCEPTION in PL/pgSQL or mocked errors)
  if (err.code === "P0001" || !err.code) {
    if (err.message && err.message.includes('Insufficient stock')) {
      return res.status(400).json({
        error_code: "INSUFFICIENT_STOCK",
        error: "Insufficient stock for product",
        error_ar: "المخزون غير كافٍ للمنتج"
      });
    }
    if (err.message && err.message.includes('Total amount mismatch')) {
      return res.status(400).json({
        error_code: "AMOUNT_MISMATCH",
        error: "Total amount does not match the sum of items",
        error_ar: "الإجمالي المُدخل لا يطابق إجمالي الأصناف"
      });
    }
  }

  // 2. Handle Foreign Key Violations (23503)
  if (err.code === "23503") {
    if (req.method === 'DELETE') {
      return res.status(400).json({ 
        error_code: "LINKED_RECORDS_EXIST", 
        error: "Cannot delete this record because it is linked to existing records.",
        error_ar: "لا يمكن الحذف لارتباط هذا العنصر بسجلات أخرى"
      });
    } else {
      return res.status(400).json({ 
        error_code: "FK_NOT_EXISTS", 
        error: "Referenced record (e.g. Category/Supplier/Customer) does not exist",
        error_ar: "العنصر المرتبط غير موجود"
      });
    }
  }

  // 3. Handle Unique Constraint Violations (23505)
  if (err.code === "23505") {
    return res.status(400).json({
      error_code: "DUPLICATE_RECORD",
      error: "Record already exists.",
      error_ar: "السجل موجود بالفعل"
    });
  }

  // 4. Handle Check Constraint Violations (23514)
  if (err.code === "23514") {
    if (err.constraint === "products_stock_quantity_check") {
      return res.status(400).json({
        error_code: "INSUFFICIENT_STOCK",
        error: "Insufficient stock.",
        error_ar: "المخزون غير كافٍ"
      });
    }
    return res.status(400).json({
      error_code: "ZERO_OR_NEGATIVE_AMOUNT",
      error: "Invalid amount or negative value detected.",
      error_ar: "قيمة غير صالحة"
    });
  }

  // 5. Fallback for all other unexpected errors
  // NEVER leak DB internals (err.message) into the client response!
  res.status(500).json({
    error_code: "SERVER_ERROR",
    error: "Internal Server Error"
  });
}

module.exports = errorHandler;
