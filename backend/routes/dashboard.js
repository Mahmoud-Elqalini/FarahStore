const router = require("express").Router();
const pool = require("../config/db");

// GET /api/dashboard — Get all dashboard statistics
router.get("/", async (req, res, next) => {
  try {
    const [
      salesRes,
      customersRes,
      productsRes,
      ordersTotalRes,
      ordersStatusRes,
      installmentsCountRes,
      installmentsLateTotalRes,
      lowStockRes,
      topSellingRes,
      upcomingInstallmentsRes,
      profitRes
    ] = await Promise.all([
      // 1 & 2: Total sales and Completed sales
      pool.query(`
        SELECT 
          COALESCE(SUM(total_amount), 0) AS total_sales,
          COALESCE(SUM(CASE WHEN order_status = 'Completed' THEN total_amount ELSE 0 END), 0) AS completed_sales
        FROM orders
      `),
      // 3: Total customers
      pool.query("SELECT COUNT(*) AS total_customers FROM customers"),
      // 4: Total products
      pool.query("SELECT COUNT(*) AS total_products FROM products"),
      // 5: Total orders
      pool.query("SELECT COUNT(*) AS total_orders FROM orders"),
      // 6, 7, 8: Orders by status
      pool.query(`
        SELECT 
          COUNT(CASE WHEN order_status = 'Active' THEN 1 END) AS active_orders,
          COUNT(CASE WHEN order_status = 'Completed' THEN 1 END) AS completed_orders,
          COUNT(CASE WHEN order_status = 'Cancelled' THEN 1 END) AS cancelled_orders
        FROM orders
      `),
      // 9 & 10: Installments count by status
      pool.query(`
        SELECT 
          COUNT(CASE WHEN status = 'Pending' THEN 1 END) AS pending_count,
          COUNT(CASE WHEN status = 'Late' THEN 1 END) AS late_count
        FROM installments
      `),
      // 11: Total late installments amount
      pool.query("SELECT COALESCE(SUM(amount), 0) AS late_total_amount FROM installments WHERE status = 'Late'"),
      // 12: Low stock products
      pool.query("SELECT product_id, product_name, stock_quantity FROM products WHERE stock_quantity < 10 ORDER BY stock_quantity ASC"),
      // 13: Top 5 selling products
      pool.query(`
        SELECT p.product_name, COALESCE(SUM(od.quantity), 0)::int AS total_sold
        FROM order_details od
        JOIN products p ON od.product_id = p.product_id
        GROUP BY p.product_name
        ORDER BY total_sold DESC
        LIMIT 5
      `),
      // 14: Upcoming installments this week
      pool.query(`
        SELECT i.installment_id, i.amount, i.due_date, c.customer_name
        FROM installments i
        JOIN orders o ON i.order_id = o.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        WHERE i.status = 'Pending'
          AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY i.due_date ASC
      `),
      // 15: Total profit (Completed orders only)
      pool.query(`
        SELECT COALESCE(SUM((p.selling_price - p.purchase_price) * od.quantity), 0) AS total_profit
        FROM order_details od
        JOIN products p ON od.product_id = p.product_id
        JOIN orders ord ON od.order_id = ord.order_id
        WHERE ord.order_status = 'Completed'
      `)
    ]);

    // Construct response object
    const dashboardData = {
      sales: {
        total: parseFloat(salesRes.rows[0].total_sales),
        completed: parseFloat(salesRes.rows[0].completed_sales),
        profit: parseFloat(profitRes.rows[0].total_profit)
      },
      counts: {
        customers: parseInt(customersRes.rows[0].total_customers),
        products: parseInt(productsRes.rows[0].total_products),
        orders: {
          total: parseInt(ordersTotalRes.rows[0].total_orders),
          active: parseInt(ordersStatusRes.rows[0].active_orders),
          completed: parseInt(ordersStatusRes.rows[0].completed_orders),
          cancelled: parseInt(ordersStatusRes.rows[0].cancelled_orders)
        }
      },
      installments: {
        pendingCount: parseInt(installmentsCountRes.rows[0].pending_count),
        lateCount: parseInt(installmentsCountRes.rows[0].late_count),
        lateTotalAmount: parseFloat(installmentsLateTotalRes.rows[0].late_total_amount)
      },
      lowStockProducts: lowStockRes.rows,
      topSellingProducts: topSellingRes.rows,
      upcomingInstallments: upcomingInstallmentsRes.rows
    };

    res.json(dashboardData);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
