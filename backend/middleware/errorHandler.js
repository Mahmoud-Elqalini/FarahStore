/**
 * Global Error Handler Middleware
 * Intercepts errors and standardizes the response without leaking DB internals.
 */
function errorHandler(err, req, res, next) {
  // Only log detailed errors in development/backend console, not to the client
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[GlobalErrorHandler] Error caught:`, err);
  }

  // 1. Handle SQLite Foreign Key Violations
  if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
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

  // 2. Handle SQLite Unique Constraint Violations
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    // تحقق من نوع الحقل المكرر
    if (err.message && err.message.includes('category_name')) {
      return res.status(400).json({ error_code: "DUPLICATE_RECORD", error: "Category name already exists.", error_ar: "اسم القسم موجود بالفعل" });
    }
    if (err.message && err.message.includes('barcode')) {
      return res.status(400).json({ error_code: "DUPLICATE_BARCODE", error: "Barcode already in use.", error_ar: "الباركود مستخدم لمنتج آخر" });
    }
    // fallback عام
    return res.status(400).json({
      error_code: "DUPLICATE_RECORD",
      error: "Record already exists.",
      error_ar: "السجل موجود بالفعل"
    });
  }

  // 3. Handle SQLite Check Constraint Violations
  if (err.code === "SQLITE_CONSTRAINT_CHECK") {
    if (err.message && err.message.includes("stock_quantity")) {
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

  // 4. Fallback for all other unexpected errors
  // NEVER leak DB internals (err.message) into the client response!
  res.status(500).json({
    error_code: "SERVER_ERROR",
    error: "Internal Server Error"
  });
}

module.exports = errorHandler;
