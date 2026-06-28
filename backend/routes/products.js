const router = require("express").Router();
const db = require("../config/db");

// GET /api/products — Get all products (active only by default)
router.get("/", (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE p.is_active = 1';

    const query = `
      SELECT p.*, c.category_name, s.supplier_name 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
      ${whereClause}
      ORDER BY p.product_id
    `;
    const result = db.prepare(query).all();
    
    const formattedResult = result.map(r => ({
      ...r,
      is_active: r.is_active === 1
    }));
    
    res.json(formattedResult);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/search — Search by barcode, SKU, or name
router.get("/search", (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json([]);
    }

    const includeInactive = req.query.include_inactive === 'true';
    const activeFilter = includeInactive ? '' : 'AND p.is_active = 1';
    
    // Note: ILIKE -> LIKE for SQLite
    const query = `
      SELECT p.*, c.category_name, s.supplier_name 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
      WHERE (
          p.barcode = ?
          OR p.sku = ?
          OR p.product_name LIKE '%' || ? || '%'
      )
      ${activeFilter}
      ORDER BY
          CASE WHEN p.barcode = ? THEN 0
               WHEN p.product_name LIKE ? || '%' THEN 1
               ELSE 2 END,
          p.product_name
      LIMIT 20
    `;
    const term = q.trim();
    const result = db.prepare(query).all(term, term, term, term, term);
    
    const formattedResult = result.map(r => ({
      ...r,
      is_active: r.is_active === 1
    }));
    
    res.json(formattedResult);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — Get single product
router.get("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT p.*, c.category_name, s.supplier_name 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
      WHERE p.product_id = ?
    `;
    const product = db.prepare(query).get(id);

    if (!product) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Product not found" });
    }
    product.is_active = product.is_active === 1;
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// POST /api/products — Create new product (SKU auto-generated via Node.js transaction)
router.post("/", (req, res, next) => {
  try {
    const { product_name, description, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode } = req.body;

    // Validations
    if (!product_name || !product_name.trim() || purchase_price === undefined || selling_price === undefined || !category_id || !supplier_id) {
      return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "product_name, purchase_price, selling_price, category_id, and supplier_id are required" });
    }

    if (purchase_price <= 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "purchase_price must be greater than zero" });
    }

    if (selling_price <= 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "selling_price must be greater than zero" });
    }

    if (selling_price < purchase_price) {
      return res.status(400).json({ error_code: "PRICE_LOGIC_ERROR", error: "selling_price cannot be less than purchase_price" });
    }

    const qty = stock_quantity !== undefined ? stock_quantity : 0;
    if (qty < 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "stock_quantity cannot be negative" });
    }

    // Transaction for atomic SKU generation
    const addProductWithSku = db.transaction((data) => {
      // Atomic Update to category counter
      const updateResult = db.prepare('UPDATE categories SET next_sku_seq = next_sku_seq + 1 WHERE category_id = ?').run(data.categoryId);
      if (updateResult.changes === 0) {
          throw new Error('Category not found');
      }
      
      const { next_sku_seq } = db.prepare('SELECT next_sku_seq FROM categories WHERE category_id = ?').get(data.categoryId);
      
      const sku = String(data.categoryId).padStart(2, '0') + '-' + String(next_sku_seq - 1).padStart(4, '0');
      
      const insertInfo = db.prepare(`
        INSERT INTO products (product_name, description, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode, sku) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.productName, data.description || null, data.purchasePrice, data.sellingPrice, data.qty, data.categoryId, data.supplierId, data.barcode || null, sku);
      
      return db.prepare('SELECT * FROM products WHERE product_id = ?').get(insertInfo.lastInsertRowid);
    });

    const newProduct = addProductWithSku({
      categoryId: category_id,
      productName: product_name.trim(),
      description,
      purchasePrice: purchase_price,
      sellingPrice: selling_price,
      qty,
      supplierId: supplier_id,
      barcode
    });

    newProduct.is_active = newProduct.is_active === 1;
    res.status(201).json({ message: "Product created successfully", data: newProduct });
  } catch (err) {
    if (err.message === 'Category not found') {
      return res.status(400).json({ error_code: "INVALID_CATEGORY", error: "Category ID is invalid" });
    }
    // Handle SQLite unique constraint error for barcode
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('barcode')) {
      return res.status(400).json({ error_code: "DUPLICATE_BARCODE", error: "هذا الباركود مستخدم لمنتج آخر." });
    }
    next(err);
  }
});

// PUT /api/products/ — Handle missing ID
router.put("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Product ID is required" });
});

// PUT /api/products/:id — Update product (sku is silently ignored)
router.put("/:id", (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch existing product
    const existing = db.prepare("SELECT * FROM products WHERE product_id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Product not found" });
    }

    // 2. Merge existing data with new data (sku is silently ignored)
    const { sku, ...body } = req.body;
    
    if (body.product_name !== undefined && !body.product_name.trim()) {
       return res.status(400).json({ error_code: "REQUIRED_FIELDS", error: "product_name cannot be empty" });
    }
    
    const product_name = body.product_name !== undefined ? body.product_name.trim() : existing.product_name;
    const description = body.description !== undefined ? body.description : existing.description;
    const purchase_price = body.purchase_price !== undefined ? body.purchase_price : existing.purchase_price;
    const selling_price = body.selling_price !== undefined ? body.selling_price : existing.selling_price;
    const stock_quantity = body.stock_quantity !== undefined ? body.stock_quantity : existing.stock_quantity;
    const category_id = body.category_id !== undefined ? body.category_id : existing.category_id;
    const supplier_id = body.supplier_id !== undefined ? body.supplier_id : existing.supplier_id;
    const barcode = body.barcode !== undefined ? (body.barcode || null) : existing.barcode;
    
    // Handling boolean mapping back to integer
    let is_active = existing.is_active;
    if (body.is_active !== undefined) {
      is_active = (body.is_active === true || body.is_active === 1 || body.is_active === 'true') ? 1 : 0;
    }

    // 3. Validations on merged data
    if (purchase_price <= 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "purchase_price must be greater than zero" });
    }
    if (selling_price <= 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "selling_price must be greater than zero" });
    }
    if (selling_price < purchase_price) {
      return res.status(400).json({ error_code: "PRICE_LOGIC_ERROR", error: "selling_price cannot be less than purchase_price" });
    }
    if (stock_quantity < 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "stock_quantity cannot be negative" });
    }

    // 4. Check barcode uniqueness (if provided and changed)
    if (barcode && barcode !== existing.barcode) {
      const barcodeCheck = db.prepare(
        "SELECT product_id FROM products WHERE barcode = ? AND product_id != ?"
      ).get(barcode, id);
      if (barcodeCheck) {
        return res.status(400).json({ error_code: "DUPLICATE_BARCODE", error: "هذا الباركود مستخدم لمنتج آخر." });
      }
    }

    // 5. Update Database
    db.prepare(
      `UPDATE products 
       SET product_name = ?, description = ?, purchase_price = ?, selling_price = ?, 
           stock_quantity = ?, category_id = ?, supplier_id = ?, barcode = ?, is_active = ?
       WHERE product_id = ?`
    ).run(product_name, description, purchase_price, selling_price, stock_quantity, category_id, supplier_id, barcode, is_active, id);

    const updatedProduct = db.prepare("SELECT * FROM products WHERE product_id = ?").get(id);
    updatedProduct.is_active = updatedProduct.is_active === 1;

    res.json({ message: "Product updated successfully", data: updatedProduct });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('barcode')) {
      return res.status(400).json({ error_code: "DUPLICATE_BARCODE", error: "هذا الباركود مستخدم لمنتج آخر." });
    }
    next(err);
  }
});

// POST /api/products/:id/restock — Restock using JS Transaction (WAC calculation)
router.post("/:id/restock", (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity, purchase_price, selling_price } = req.body;

    // Validate inputs
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "Restock quantity must be positive" });
    }
    if (!purchase_price || purchase_price <= 0) {
      return res.status(400).json({ error_code: "NEGATIVE_VALUE", error: "Purchase price must be positive" });
    }

    const restockProduct = db.transaction((productId, newQty, newPrice, newSellingPrice) => {
      const product = db.prepare('SELECT stock_quantity, purchase_price, selling_price, is_active FROM products WHERE product_id = ?').get(productId);
      
      if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
      }
      if (product.is_active === 0) {
        throw new Error('INACTIVE_PRODUCT');
      }
      
      // Calculate WAC
      const weightedPrice = +((product.stock_quantity * product.purchase_price + newQty * newPrice) / (product.stock_quantity + newQty)).toFixed(2);
      const finalSellingPrice = newSellingPrice || product.selling_price;
      
      if (weightedPrice > finalSellingPrice) {
        throw new Error('WAC_EXCEEDS_SELLING_PRICE');
      }
      
      db.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, purchase_price = ?, selling_price = ? WHERE product_id = ?')
        .run(newQty, weightedPrice, finalSellingPrice, productId);
      
      return db.prepare('SELECT * FROM products WHERE product_id = ?').get(productId);
    });

    try {
      const updatedProduct = restockProduct(id, quantity, purchase_price, selling_price || null);
      updatedProduct.is_active = updatedProduct.is_active === 1;
      
      res.json({
        message: "تم إعادة التخزين بنجاح",
        data: updatedProduct,
        added_quantity: quantity
      });
    } catch (txErr) {
      if (txErr.message === 'PRODUCT_NOT_FOUND') {
        return res.status(404).json({ error_code: "NOT_FOUND", error: "Product not found" });
      }
      if (txErr.message === 'INACTIVE_PRODUCT') {
        return res.status(400).json({ error_code: "INACTIVE_PRODUCT", error: "Cannot restock an inactive product." });
      }
      if (txErr.message === 'WAC_EXCEEDS_SELLING_PRICE') {
        return res.status(400).json({ 
          error_code: "PRICE_LOGIC_ERROR", 
          error_ar: "لا يمكن إتمام العملية لأن متوسط التكلفة الجديد (WAC) سيتخطى سعر البيع. يرجى إدخال سعر بيع جديد.",
          error: "Cannot restock because weighted average cost exceeds selling price. Provide new_selling_price." 
        });
      }
      throw txErr;
    }

  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/ — Handle missing ID
router.delete("/", (req, res, next) => {
  res.status(400).json({ error_code: "ID_REQUIRED", error: "Product ID is required" });
});

// DELETE /api/products/:id — Soft Delete (Deactivate)
router.delete("/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const info = db.prepare("UPDATE products SET is_active = 0 WHERE product_id = ? AND is_active = 1").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Product not found or already inactive" });
    }
    
    const product = db.prepare("SELECT * FROM products WHERE product_id = ?").get(id);
    product.is_active = product.is_active === 1;
    
    res.json({ message: "Product deactivated successfully", data: product });
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id/activate — Reactivate product
router.put("/:id/activate", (req, res, next) => {
  try {
    const { id } = req.params;
    const info = db.prepare("UPDATE products SET is_active = 1 WHERE product_id = ? AND is_active = 0").run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error_code: "NOT_FOUND", error: "Product not found or already active" });
    }
    
    const product = db.prepare("SELECT * FROM products WHERE product_id = ?").get(id);
    product.is_active = product.is_active === 1;
    
    res.json({ message: "Product activated successfully", data: product });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
