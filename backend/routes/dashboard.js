const router = require("express").Router();
const db = require("../config/db");

// GET /api/dashboard — Get all dashboard statistics
router.get("/", (req, res, next) => {
  try {
    const getDashboardData = db.transaction(() => {
      // 1 & 2: Total sales and Completed sales
      const salesRes = db.prepare(`
        SELECT 
          COALESCE(SUM(total_amount), 0) AS total_sales,
          COALESCE(SUM(CASE WHEN order_status = 'Completed' THEN total_amount ELSE 0 END), 0) AS completed_sales
        FROM orders
      `).get();

      // 3: Total customers
      const customersRes = db.prepare("SELECT COUNT(*) AS total_customers FROM customers").get();

      // 4: Total products
      const productsRes = db.prepare("SELECT COUNT(*) AS total_products FROM products").get();

      // 5: Total orders
      const ordersTotalRes = db.prepare("SELECT COUNT(*) AS total_orders FROM orders").get();

      // 6, 7, 8: Orders by status
      const ordersStatusRes = db.prepare(`
        SELECT 
          COUNT(CASE WHEN order_status = 'Active' THEN 1 END) AS active_orders,
          COUNT(CASE WHEN order_status = 'Completed' THEN 1 END) AS completed_orders,
          COUNT(CASE WHEN order_status = 'Cancelled' THEN 1 END) AS cancelled_orders
        FROM orders
      `).get();

      // 9 & 10: Installments count by status
      const installmentsCountRes = db.prepare(`
        SELECT 
          COUNT(CASE WHEN status = 'Pending' THEN 1 END) AS pending_count,
          COUNT(CASE WHEN status = 'Late' THEN 1 END) AS late_count
        FROM installments
      `).get();

      // 11: Total late installments amount
      const installmentsLateTotalRes = db.prepare("SELECT COALESCE(SUM(amount), 0) AS late_total_amount FROM installments WHERE status = 'Late'").get();

      // 12: Low stock products
      const lowStockRes = db.prepare("SELECT product_id, product_name, stock_quantity FROM products WHERE stock_quantity < 10 ORDER BY stock_quantity ASC").all();

      // 13: Top 5 selling products (Removed PG ::int cast)
      const topSellingRes = db.prepare(`
        SELECT p.product_name, COALESCE(SUM(od.quantity), 0) AS total_sold
        FROM order_details od
        JOIN products p ON od.product_id = p.product_id
        GROUP BY p.product_name
        ORDER BY total_sold DESC
        LIMIT 5
      `).all();

      // 14: Upcoming installments this week (Fixed PG INTERVAL syntax for SQLite)
      const upcomingInstallmentsRes = db.prepare(`
        SELECT i.installment_id, i.amount, i.due_date, c.customer_name
        FROM installments i
        JOIN orders o ON i.order_id = o.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        WHERE i.status = 'Pending'
          AND i.due_date BETWEEN date('now') AND date('now', '+7 days')
        ORDER BY i.due_date ASC
      `).all();

      // 15: Total profit (Completed orders only)
      const profitRes = db.prepare(`
        SELECT COALESCE(SUM((p.selling_price - p.purchase_price) * od.quantity), 0) AS total_profit
        FROM order_details od
        JOIN products p ON od.product_id = p.product_id
        JOIN orders ord ON od.order_id = ord.order_id
        WHERE ord.order_status = 'Completed'
      `).get();

      return {
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
      };
    });

    const data = getDashboardData();

    // Construct response object
    const dashboardData = {
      sales: {
        total: parseFloat(data.salesRes.total_sales),
        completed: parseFloat(data.salesRes.completed_sales),
        profit: parseFloat(data.profitRes.total_profit)
      },
      counts: {
        customers: parseInt(data.customersRes.total_customers),
        products: parseInt(data.productsRes.total_products),
        orders: {
          total: parseInt(data.ordersTotalRes.total_orders),
          active: parseInt(data.ordersStatusRes.active_orders),
          completed: parseInt(data.ordersStatusRes.completed_orders),
          cancelled: parseInt(data.ordersStatusRes.cancelled_orders)
        }
      },
      installments: {
        pendingCount: parseInt(data.installmentsCountRes.pending_count),
        lateCount: parseInt(data.installmentsCountRes.late_count),
        lateTotalAmount: parseFloat(data.installmentsLateTotalRes.late_total_amount)
      },
      lowStockProducts: data.lowStockRes,
      topSellingProducts: data.topSellingRes.map(item => ({...item, total_sold: parseInt(item.total_sold)})),
      upcomingInstallments: data.upcomingInstallmentsRes
    };

    res.json(dashboardData);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
