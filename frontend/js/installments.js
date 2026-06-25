// installments.js
const API_URL = 'http://localhost:3000/api';

let allInstallments = []; // Source of truth from backend
let currentPaymentId = null;

// DOM Elements
const installmentsTbody = document.getElementById('installmentsTbody');
const tableLoading = document.getElementById('tableLoading');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');

const totalUnpaidEl = document.getElementById('totalUnpaid');
const lateCountEl = document.getElementById('lateCount');

// Edit Modal
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const btnSaveEdit = document.getElementById('btnSaveEdit');

// Payment Modal
const paymentModal = document.getElementById('paymentModal');
const btnConfirmPayment = document.getElementById('btnConfirmPayment');

document.addEventListener('DOMContentLoaded', () => {
  fetchInstallments();
});

// --- Data Fetching ---
async function fetchInstallments() {
  try {
    showLoading();
    const res = await axios.get(`${API_URL}/installments`);
    allInstallments = res.data;
    renderPipeline();
  } catch (error) {
    showToast('خطأ في تحميل الأقساط', 'error');
    console.error(error);
  } finally {
    hideLoading();
  }
}

// --- The Unified Pipeline ---
function renderPipeline() {
  const searchTerm = searchInput.value.trim().replace(/\s+/g, ' ').toLowerCase();
  const filterVal = statusFilter.value;
  const todayDate = new Date();
  todayDate.setHours(0,0,0,0);

  let totalUnpaid = 0;
  let lateCount = 0;

  // 1. Compute Derived Flags (isLate) & DisplayStatus
  const processed = allInstallments.map(i => {
    const due = new Date(i.due_date);
    due.setHours(0,0,0,0);
    // UI Logic: Late if not Paid AND past due
    const isLate = i.status !== 'Paid' && due < todayDate;
    const displayStatus = isLate ? 'Late' : i.status;
    
    // Calculate global metrics using derived flags
    if (displayStatus !== 'Paid') {
      totalUnpaid += Number(i.amount);
    }
    if (isLate) {
      lateCount++;
    }

    return { ...i, isLate, displayStatus };
  });

  // Update Metrics UI
  totalUnpaidEl.textContent = `ج.م ${totalUnpaid.toFixed(2)}`;
  lateCountEl.textContent = lateCount;

  // 2. Filter Search
  const searchFiltered = processed.filter(i => {
    if (!searchTerm) return true;
    return (
      i.installment_id.toString().includes(searchTerm) ||
      i.order_id.toString().includes(searchTerm) ||
      (i.customer_name && i.customer_name.toLowerCase().includes(searchTerm))
    );
  });

  // 3. Filter Status
  const statusFiltered = searchFiltered.filter(i => {
    if (filterVal === 'All') return true;
    return i.displayStatus === filterVal;
  });

  // 4. Sort (Late -> Due Date)
  const sorted = statusFiltered.sort((a, b) => {
    const priority = { 'Late': 1, 'Pending': 2, 'Paid': 3 };
    if (priority[a.displayStatus] !== priority[b.displayStatus]) {
      return priority[a.displayStatus] - priority[b.displayStatus];
    }
    // Tie-breaker: Due date ASC
    return new Date(a.due_date) - new Date(b.due_date);
  });

  renderTable(sorted);
}

// Event Listeners for Filters
let searchTimeout;
searchInput.addEventListener('keyup', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(renderPipeline, 300);
});
statusFilter.addEventListener('change', renderPipeline);

// --- Render Table ---
function renderTable(data) {
  installmentsTbody.innerHTML = '';
  if (data.length === 0) {
    installmentsTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 30px; color:#999;">لا توجد بيانات مطابقة</td></tr>`;
    return;
  }

  data.forEach(i => {
    const amountStr = Number(i.amount).toFixed(2);
    const dueStr = i.due_date ? i.due_date.split('T')[0] : '-';
    const payStr = i.payment_date ? i.payment_date.split('T')[0] : '-';

    let badgeClass = '';
    if (i.displayStatus === 'Late') badgeClass = 'status-late';
    else if (i.displayStatus === 'Paid') badgeClass = 'status-paid';
    else badgeClass = 'status-pending';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${i.installment_id}</td>
      <td><strong>${i.customer_name ? escapeHTML(i.customer_name) : '-'}</strong></td>
      <td>#${i.order_id}</td>
      <td style="font-weight:bold; color:var(--primary-color)">${amountStr}</td>
      <td>${dueStr}</td>
      <td>${payStr}</td>
      <td><span class="status-badge ${badgeClass}">${i.displayStatus}</span></td>
      <td class="actions-cell">
        ${i.status !== 'Paid' ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal(${i.installment_id})">تحصيل</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openEditModal(${i.installment_id})">تعديل</button>
      </td>
    `;
    installmentsTbody.appendChild(tr);
  });
}

// --- Quick Payment Action ---
function openPaymentModal(id) {
  const item = allInstallments.find(x => x.installment_id === id);
  if (!item || item.status === 'Paid') return; // Prevent duplicate payment
  currentPaymentId = id;
  document.getElementById('paymentInstallmentId').textContent = id;
  paymentModal.classList.add('active');
}

function closePaymentModal() {
  paymentModal.classList.remove('active');
  currentPaymentId = null;
}

btnConfirmPayment.addEventListener('click', async () => {
  if (!currentPaymentId) return;
  try {
    btnConfirmPayment.disabled = true;
    btnConfirmPayment.textContent = 'جاري التحصيل...';

    const today = new Date().toISOString().split('T')[0];
    await axios.put(`${API_URL}/installments/${currentPaymentId}`, {
      status: 'Paid',
      payment_date: today
    });

    showToast('تم تحصيل القسط بنجاح', 'success');
    closePaymentModal();
    await fetchInstallments(); // Refresh UI only on success
  } catch (error) {
    showToast('حدث خطأ أثناء التحصيل', 'error');
    console.error(error);
  } finally {
    btnConfirmPayment.disabled = false;
    btnConfirmPayment.textContent = 'تأكيد التحصيل';
  }
});

// --- Edit Modal ---
function openEditModal(id) {
  const i = allInstallments.find(x => x.installment_id === id);
  if (!i) return;

  document.getElementById('editInstallmentId').value = i.installment_id;
  document.getElementById('editCustomerInfo').value = `${i.customer_name || ''} (طلب #${i.order_id})`;
  document.getElementById('editAmount').value = Number(i.amount).toFixed(2);
  
  document.getElementById('editDueDate').value = i.due_date ? i.due_date.split('T')[0] : '';
  document.getElementById('editStatus').value = i.status === 'Late' ? 'Pending' : i.status; // Raw backend status (shouldn't be 'Late' anyway, but just in case)
  document.getElementById('editPaymentDate').value = i.payment_date ? i.payment_date.split('T')[0] : '';

  editModal.classList.add('active');
}

function closeEditModal() {
  editModal.classList.remove('active');
}

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('editInstallmentId').value;
  const dueDate = document.getElementById('editDueDate').value;
  const status = document.getElementById('editStatus').value;
  let paymentDate = document.getElementById('editPaymentDate').value;

  // Data Consistency Rule: Nullify payment_date if not Paid
  if (status !== 'Paid') {
    paymentDate = null;
  }

  const payload = {
    due_date: dueDate,
    status: status,
    payment_date: paymentDate
  };

  try {
    btnSaveEdit.disabled = true;
    btnSaveEdit.textContent = 'جاري الحفظ...';

    await axios.put(`${API_URL}/installments/${id}`, payload);
    showToast('تم تعديل القسط بنجاح', 'success');
    closeEditModal();
    await fetchInstallments(); // Update DB truth
  } catch (error) {
    showToast(error.response?.data?.error || 'حدث خطأ أثناء التعديل', 'error');
    console.error(error);
  } finally {
    btnSaveEdit.disabled = false;
    btnSaveEdit.textContent = 'حفظ التعديلات';
  }
});

// --- Helpers ---
function showLoading() { tableLoading.style.display = 'flex'; }
function hideLoading() { tableLoading.style.display = 'none'; }
