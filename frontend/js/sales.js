let allOrders = [];

document.addEventListener('DOMContentLoaded', () => {
  loadOrders();

  // Event Listeners for filters
  document.getElementById('search-input').addEventListener('input', renderOrders);

  const paymentRadios = document.querySelectorAll('input[name="filter_payment"]');
  paymentRadios.forEach(r => r.addEventListener('change', renderOrders));

  const statusRadios = document.querySelectorAll('input[name="filter_status"]');
  statusRadios.forEach(r => r.addEventListener('change', renderOrders));
});

async function loadOrders() {
  try {
    const res = await apiCall('/orders');
    allOrders = Array.isArray(res) ? res : (res.data || []);
    renderOrders();
  } catch (err) {
    console.error('Error loading orders:', err);
    document.getElementById('sales-tbody').innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #e74c3c; padding: 30px;">
          حدث خطأ أثناء تحميل المبيعات
        </td>
      </tr>
    `;
  }
}

function formatDateArabic(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusInfo(status) {
  switch (status) {
    case 'Active': return { label: 'نشط', class: 'status-active' };
    case 'Completed': return { label: 'مكتمل', class: 'status-completed' };
    case 'Cancelled': return { label: 'ملغي', class: 'status-cancelled' };
    default: return { label: status || 'غير معروف', class: 'status-unknown' };
  }
}

function renderOrders() {
  const tbody = document.getElementById('sales-tbody');
  tbody.innerHTML = '';

  const searchQuery = (document.getElementById('search-input').value || '').toLowerCase().trim();
  const paymentFilter = document.querySelector('input[name="filter_payment"]:checked').value;
  const statusFilter = document.querySelector('input[name="filter_status"]:checked').value;

  const filtered = allOrders.filter(order => {
    // Search
    const invNo = `ORD-${order.order_id}`.toLowerCase();
    const custName = (order.customer_name || '').toLowerCase();
    const matchesSearch = invNo.includes(searchQuery) || custName.includes(searchQuery);

    // Payment Type
    const matchesPayment = paymentFilter === 'all' || order.payment_type === paymentFilter;

    // Status
    const matchesStatus = statusFilter === 'all' || order.order_status === statusFilter;

    return matchesSearch && matchesPayment && matchesStatus;
  });

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.textAlign = 'center';
    td.style.padding = '30px';
    td.style.color = 'var(--text-muted)';
    td.textContent = 'لا توجد فواتير مطابقة للبحث';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(order => {
    const tr = document.createElement('tr');

    // Invoice
    const tdInvoice = document.createElement('td');
    tdInvoice.textContent = `ORD-${order.order_id}`;
    tdInvoice.style.fontWeight = 'bold';
    tdInvoice.style.color = 'var(--primary)';

    // Customer
    const tdCustomer = document.createElement('td');
    tdCustomer.textContent = order.customer_name || 'عميل محذوف';

    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = formatDateArabic(order.order_date);

    // Total
    const tdTotal = document.createElement('td');
    tdTotal.textContent = `${Number(order.total_amount).toFixed(2)}`;

    // Payment Type
    const tdPayment = document.createElement('td');
    tdPayment.textContent = order.payment_type === 'Cash' ? 'كاش' : 'تقسيط';

    // Status
    const tdStatus = document.createElement('td');
    const statusInfo = getStatusInfo(order.order_status);
    const badge = document.createElement('span');
    badge.className = `status-badge ${statusInfo.class}`;
    badge.textContent = statusInfo.label;
    tdStatus.appendChild(badge);

    // Actions
    const tdAction = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.padding = '6px 12px';
    btn.style.fontSize = '0.9rem';
    btn.textContent = 'عرض التفاصيل';
    btn.onclick = () => openDetailsModal(order.order_id);
    tdAction.appendChild(btn);

    tr.appendChild(tdInvoice);
    tr.appendChild(tdCustomer);
    tr.appendChild(tdDate);
    tr.appendChild(tdTotal);
    tr.appendChild(tdPayment);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });
}

async function openDetailsModal(orderId) {
  const modal = document.getElementById('details-modal');
  const tbody = document.getElementById('modal-items-tbody');

  // Reset contents and show loading state
  document.getElementById('modal-title').textContent = `تفاصيل الفاتورة ORD-${orderId}`;
  document.getElementById('modal-customer').textContent = 'جاري التحميل...';
  document.getElementById('modal-payment-type').textContent = '';
  document.getElementById('modal-status').className = '';
  document.getElementById('modal-status').textContent = '';
  document.getElementById('modal-total').textContent = '0.00';
  document.getElementById('modal-remaining').textContent = '0.00';
  document.getElementById('modal-remaining-container').style.display = 'none';

  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;"><div class="skeleton-box" style="margin: 20px 0;"></div></td></tr>';

  modal.classList.add('active');

  try {
    const orderData = await apiCall(`/orders/${orderId}`);

    document.getElementById('modal-customer').textContent = orderData.customer_name || 'عميل غير معروف';
    document.getElementById('modal-payment-type').textContent = orderData.payment_type === 'Cash' ? 'كاش' : 'تقسيط';

    const statusInfo = getStatusInfo(orderData.order_status);
    const statusEl = document.getElementById('modal-status');
    statusEl.className = `status-badge ${statusInfo.class}`;
    statusEl.textContent = statusInfo.label;

    document.getElementById('modal-total').textContent = Number(orderData.total_amount).toFixed(2);

    if (orderData.payment_type === 'Installment') {
      document.getElementById('modal-remaining-container').style.display = 'flex';
      const remaining = orderData.remaining_balance || 0;
      document.getElementById('modal-remaining').textContent = Number(remaining).toFixed(2);
    }

    // Render items
    tbody.innerHTML = '';
    if (!orderData.items || orderData.items.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.style.textAlign = 'center';
      td.textContent = 'لا توجد منتجات في هذه الفاتورة';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      orderData.items.forEach(item => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = item.product_name || `منتج #${item.product_id}`;

        const tdQty = document.createElement('td');
        tdQty.textContent = item.quantity;

        const tdPrice = document.createElement('td');
        tdPrice.textContent = Number(item.unit_price).toFixed(2);

        const tdTotal = document.createElement('td');
        const itemTotal = Number(item.unit_price) * item.quantity;
        tdTotal.textContent = itemTotal.toFixed(2);

        tr.appendChild(tdName);
        tr.appendChild(tdQty);
        tr.appendChild(tdPrice);
        tr.appendChild(tdTotal);

        tbody.appendChild(tr);
      });
    }

  } catch (err) {
    console.error('Failed to load order details:', err);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #e74c3c;">فشل تحميل تفاصيل الفاتورة</td></tr>';
  }
}

function closeDetailsModal() {
  document.getElementById('details-modal').classList.remove('active');
}
