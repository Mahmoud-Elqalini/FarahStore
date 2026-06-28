let allInstallments = [];
let selectedInstallmentId = null;
let selectedOrderId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadInstallments();

  // Filters
  document.getElementById('search-input').addEventListener('input', renderInstallments);
  const statusRadios = document.querySelectorAll('input[name="filter_status"]');
  statusRadios.forEach(r => r.addEventListener('change', renderInstallments));

  // Date input max default
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('pay-modal-date').value = today;
  document.getElementById('pay-modal-date').max = today;
  
  // Pay confirm button
  document.getElementById('confirm-pay-btn').addEventListener('click', confirmPayment);
});

async function loadInstallments() {
  try {
    const res = await apiCall('/installments');
    allInstallments = Array.isArray(res) ? res : (res.data || []);
    
    // Auto-update late status strictly on client side if passed due date and not paid
    const today = new Date();
    today.setHours(0,0,0,0);
    allInstallments.forEach(inst => {
      if (inst.status === 'Pending') {
        const dueDate = new Date(inst.due_date);
        if (dueDate < today) {
          inst.status = 'Late';
        }
      }
    });

    updateSummaryCards();
    renderInstallments();
  } catch (err) {
    console.error('Error loading installments:', err);
    document.getElementById('installments-tbody').innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #e74c3c; padding: 30px;">
          حدث خطأ أثناء تحميل الأقساط
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
    day: 'numeric'
  });
}

function getStatusInfo(status) {
  switch (status) {
    case 'Pending': return { label: 'معلق 🟡', class: 'status-pending' };
    case 'Paid': return { label: 'مدفوع 🟢', class: 'status-paid' };
    case 'Late': return { label: 'متأخر 🔴', class: 'status-late' };
    default: return { label: status, class: '' };
  }
}

function updateSummaryCards() {
  let pendingCount = 0, pendingTotal = 0;
  let lateCount = 0, lateTotal = 0;
  let paidCount = 0, paidTotal = 0;

  allInstallments.forEach(inst => {
    const amount = Number(inst.amount) || 0;
    if (inst.status === 'Pending') {
      pendingCount++;
      pendingTotal += amount;
    } else if (inst.status === 'Late') {
      lateCount++;
      lateTotal += amount;
    } else if (inst.status === 'Paid') {
      paidCount++;
      paidTotal += amount;
    }
  });

  document.getElementById('summary-pending-count').textContent = `العدد: ${pendingCount} قسط`;
  document.getElementById('summary-pending-total').textContent = `${pendingTotal.toFixed(2)} ج.م`;

  document.getElementById('summary-late-count').textContent = `العدد: ${lateCount} قسط`;
  document.getElementById('summary-late-total').textContent = `${lateTotal.toFixed(2)} ج.م`;

  document.getElementById('summary-paid-count').textContent = `العدد: ${paidCount} قسط`;
  document.getElementById('summary-paid-total').textContent = `${paidTotal.toFixed(2)} ج.م`;
}

function renderInstallments() {
  const tbody = document.getElementById('installments-tbody');
  tbody.innerHTML = '';

  const searchQuery = (document.getElementById('search-input').value || '').toLowerCase().trim();
  const statusFilter = document.querySelector('input[name="filter_status"]:checked').value;

  const filtered = allInstallments.filter(inst => {
    // Search
    const invNo = (inst.invoice_number || `ORD-${inst.order_id}`).toLowerCase();
    const custName = (inst.customer_name || '').toLowerCase();
    const matchesSearch = invNo.includes(searchQuery) || custName.includes(searchQuery);

    // Status
    const matchesStatus = statusFilter === 'all' || inst.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.textAlign = 'center';
    td.style.padding = '30px';
    td.style.color = 'var(--text-muted)';
    td.textContent = 'لا توجد أقساط مطابقة للبحث';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(inst => {
    const tr = document.createElement('tr');
    
    // Invoice
    const tdInvoice = document.createElement('td');
    tdInvoice.textContent = inst.invoice_number || `ORD-${inst.order_id}`;
    tdInvoice.style.fontWeight = 'bold';
    tdInvoice.style.color = 'var(--primary)';

    // Customer
    const tdCustomer = document.createElement('td');
    tdCustomer.textContent = inst.customer_name || 'عميل محذوف';

    // Number
    const tdNumber = document.createElement('td');
    tdNumber.textContent = inst.installment_number;

    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = formatDateArabic(inst.due_date);

    // Amount
    const tdAmount = document.createElement('td');
    tdAmount.textContent = `${Number(inst.amount).toFixed(2)} ج.م`;

    // Status
    const tdStatus = document.createElement('td');
    const statusInfo = getStatusInfo(inst.status);
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
    btn.textContent = 'تسجيل دفع';
    
    if (inst.status === 'Paid') {
      btn.disabled = true;
      btn.className = 'btn btn-secondary';
      btn.style.opacity = '0.5';
      btn.textContent = 'مدفوع';
    } else {
      btn.onclick = () => openPayModal(inst);
    }
    
    tdAction.appendChild(btn);

    tr.appendChild(tdInvoice);
    tr.appendChild(tdCustomer);
    tr.appendChild(tdNumber);
    tr.appendChild(tdDate);
    tr.appendChild(tdAmount);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });
}

function openPayModal(inst) {
  selectedInstallmentId = inst.installment_id;
  selectedOrderId = inst.order_id;
  
  document.getElementById('pay-modal-customer').textContent = inst.customer_name;
  document.getElementById('pay-modal-number').textContent = inst.installment_number;
  document.getElementById('pay-modal-amount').textContent = Number(inst.amount).toFixed(2);
  
  document.getElementById('pay-modal').classList.add('active');
}

function closePayModal() {
  selectedInstallmentId = null;
  selectedOrderId = null;
  document.getElementById('pay-modal').classList.remove('active');
}

async function confirmPayment() {
  if (!selectedInstallmentId) return;

  const btn = document.getElementById('confirm-pay-btn');
  btn.disabled = true;
  btn.textContent = 'جاري التنفيذ...';

  const paymentDate = document.getElementById('pay-modal-date').value;

  try {
    const res = await apiCall(`/installments/${selectedInstallmentId}/pay`, 'PATCH', {
      payment_date: paymentDate
    });

    // Check if order is now completed to show unified message
    try {
      const orderRes = await apiCall(`/orders/${selectedOrderId}`);
      if (orderRes.order_status === 'Completed') {
        showToast(`تم تسجيل الدفع وإغلاق الفاتورة ORD-${selectedOrderId} بالكامل ✅`, 'success');
      } else {
        showToast(res.message || 'تم تسجيل الدفع بنجاح', 'success');
      }
    } catch (err) {
      // Fallback if order check fails
      showToast(res.message || 'تم تسجيل الدفع بنجاح', 'success');
    }

    // Update local state instantly
    const inst = allInstallments.find(i => i.installment_id === selectedInstallmentId);
    if (inst) {
      inst.status = 'Paid';
      inst.payment_date = paymentDate || new Date().toISOString();
    }

    updateSummaryCards();
    renderInstallments();
    closePayModal();

  } catch (err) {
    console.error('Payment failed:', err);
    // showToast handles error messages internally via apiCall
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد الدفع';
  }
}
