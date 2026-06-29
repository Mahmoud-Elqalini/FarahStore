document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  // تحديث تلقائي كل 60 ثانية
  setInterval(loadDashboardData, 60000);
});

async function loadDashboardData() {
  const tbody = document.getElementById('low-stock-table-body');
  const loader = document.getElementById('table-loading');

  // Show Skeletons before data arrives
  renderSkeleton('low-stock-table-body', 4);
  loader.classList.add('active');

  try {
    const data = await apiCall('/dashboard');
    
    // 1. Fill Sales Card
    document.getElementById('sales-total').textContent = formatCurrency(data.sales.total);
    document.getElementById('sales-completed').textContent = `مكتملة: ${formatCurrency(data.sales.completed)}`;

    // 2. Fill Customers & Products Card
    document.getElementById('customers-count').textContent = data.counts.customers;
    document.getElementById('products-count').textContent = data.counts.products;

    // 3. Fill Orders Card
    document.getElementById('orders-total').textContent = data.counts.orders.total;
    document.getElementById('orders-active').textContent = `نشط: ${data.counts.orders.active}`;
    document.getElementById('orders-completed').textContent = `مكتمل: ${data.counts.orders.completed}`;
    document.getElementById('orders-cancelled').textContent = `ملغي: ${data.counts.orders.cancelled}`;

    // 4. Fill Installments Card
    document.getElementById('installments-late-amount').textContent = formatCurrency(data.installments.lateTotalAmount);
    document.getElementById('installments-pending').textContent = `معلق: ${data.installments.pendingCount}`;
    document.getElementById('installments-late').textContent = `متأخر: ${data.installments.lateCount}`;

    // Update Sidebar Badge for late installments
    const sidebarBadge = document.getElementById('sidebar-late-badge');
    if (data.installments.lateCount > 0) {
      sidebarBadge.textContent = data.installments.lateCount;
      sidebarBadge.style.display = 'inline-block';
    } else {
      sidebarBadge.style.display = 'none';
    }

    // 5. Fill Profit Card
    document.getElementById('sales-profit').textContent = formatCurrency(data.sales.profit);

    // 6. Fill Low Stock Table
    if (data.lowStockProducts.length === 0) {
      renderEmptyState('low-stock-table-body', 'لا توجد منتجات منخفضة المخزون 🟢');
    } else {
      tbody.innerHTML = '';
      data.lowStockProducts.forEach((product, index) => {
        const isCritical = product.stock_quantity < 5;
        const colorStyle = isCritical ? 'color: var(--status-cancelled); font-weight: 700;' : '';
        
        tbody.innerHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHTML(product.product_name)}</td>
            <td style="${colorStyle}">${product.stock_quantity} قطعة</td>
          </tr>
        `;
      });
    }

    // 7. Fill Top Selling Products Table
    const topSellingBody = document.getElementById('top-selling-table-body');
    if (data.topSellingProducts.length === 0) {
      renderEmptyState('top-selling-table-body', 'لا توجد مبيعات بعد');
    } else {
      topSellingBody.innerHTML = '';
      data.topSellingProducts.forEach((product, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        topSellingBody.innerHTML += `
          <tr>
            <td>${medal} ${escapeHTML(product.product_name)}</td>
            <td>${product.total_sold} قطعة</td>
          </tr>
        `;
      });
    }

    // 8. Fill Upcoming Installments Table
    const upcomingBody = document.getElementById('upcoming-installments-body');
    if (data.upcomingInstallments.length === 0) {
      renderEmptyState('upcoming-installments-body', 'لا توجد أقساط مستحقة هذا الأسبوع 🟢');
    } else {
      upcomingBody.innerHTML = '';
      data.upcomingInstallments.forEach(inst => {
        upcomingBody.innerHTML += `
          <tr>
            <td>${escapeHTML(inst.customer_name)}</td>
            <td>${formatCurrency(inst.amount)}</td>
            <td>${formatDate(inst.due_date)}</td>
          </tr>
        `;
      });
    }

  } catch (error) {
    console.error('Error loading dashboard:', error);
    renderEmptyState('low-stock-table-body', 'حدث خطأ أثناء جلب البيانات ❌');
  } finally {
    loader.classList.remove('active');
  }
}
