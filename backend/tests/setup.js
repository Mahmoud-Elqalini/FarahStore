const db = require('../config/db');

beforeEach(() => {
  // Clear all tables
  db.exec(`
    DELETE FROM order_details;
    DELETE FROM installments;
    DELETE FROM orders;
    DELETE FROM products;
    DELETE FROM customers;
    DELETE FROM suppliers;
    DELETE FROM categories;
    DELETE FROM sqlite_sequence;
  `);

  // Seed default data expected by the tests
  db.exec(`
    INSERT INTO categories (category_id, category_name, is_active, next_sku_seq) VALUES (1, 'Electronics', 1, 2);
    INSERT INTO suppliers (supplier_id, supplier_name, phone, is_active) VALUES (1, 'Test Supplier', '01123456789', 1);
    INSERT INTO customers (customer_id, customer_name, phone, is_active) VALUES (1, 'Test Customer', '01123456789', 1);
    
    INSERT INTO products (product_id, product_name, purchase_price, selling_price, stock_quantity, category_id, supplier_id, sku, barcode, is_active)
    VALUES (1, 'Test Product', 100, 150, 10, 1, 1, '01-0001', '111', 1);
    
    INSERT INTO orders (order_id, customer_id, total_amount, payment_type, order_status) 
    VALUES (1, 1, 150, 'Cash', 'Completed');

    INSERT INTO order_details (order_detail_id, order_id, product_id, quantity, unit_price)
    VALUES (1, 1, 1, 1, 150);
  `);
});

afterAll(() => {
  // Close the database connection if needed (better-sqlite3 closes when process ends, but it's good practice)
  db.close();
});
