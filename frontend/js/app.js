// Base API URL
const API_BASE = '/api';

// Error codes dictionary — maps server error_code to Arabic user-facing messages
const ERROR_MESSAGES = {
  REQUIRED_FIELDS: 'يرجى تعبئة جميع الحقول المطلوبة',
  INVALID_PHONE_FORMAT: 'رقم الهاتف يجب أن يحتوي على أرقام فقط (10-15 رقم)',
  NEGATIVE_VALUE: 'القيمة المدخلة لا يمكن أن تكون سالبة',
  PRICE_LOGIC_ERROR: 'سعر البيع لا يمكن أن يكون أقل من سعر الشراء',
  ZERO_OR_NEGATIVE_AMOUNT: 'القيمة يجب أن تكون أكبر من صفر',
  FK_NOT_EXISTS: 'العنصر المرتبط (قسم/مورد/عميل/منتج) غير موجود',
  INVALID_PAYMENT_TYPE: 'نوع الدفع يجب أن يكون نقدي أو بالتقسيط',
  INVALID_STATUS: 'حالة القسط غير صحيحة',
  AMOUNT_MISMATCH: 'الإجمالي المُدخل لا يطابق إجمالي الأصناف',
  NOT_FOUND: 'العنصر المطلوب غير موجود',
  ID_REQUIRED: 'المعرف (ID) مطلوب',
  VALIDATION_ERROR: 'بيانات غير صحيحة، يرجى التحقق من الحقول',
  SERVER_ERROR: 'حدث خطأ في الخادم، يرجى المحاولة مرة أخرى',
  CATEGORY_IN_USE: 'لا يمكن تعطيل قسم يحتوي على منتجات نشطة',
  SUPPLIER_IN_USE: 'لا يمكن تعطيل مورد مرتبط بمنتجات نشطة',
  CUSTOMER_HAS_OBLIGATIONS: 'لا يمكن تعطيل عميل لديه طلبات مفتوحة أو أقساط غير مسددة'
};

/**
 * Centralized API Caller
 * @param {string} endpoint - e.g., '/dashboard'
 * @param {string} method - 'GET', 'POST', 'PUT', 'DELETE'
 * @param {object} body - Payload
 */
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      // Priority: error_ar (dynamic) > dictionary lookup > fallback
      const errorMsg = data.error_ar || ERROR_MESSAGES[data.error_code] || ERROR_MESSAGES.SERVER_ERROR;
      showToast(errorMsg, 'error');
      throw new Error(data.error || errorMsg);
    }

    return data;
  } catch (err) {
    // Handle network errors (e.g. server is down)
    if(err.message === 'Failed to fetch') {
      showToast('خطأ في الاتصال بالخادم، يرجى التأكد من تشغيل الـ Backend', 'error');
    }
    console.error('API Error:', err);
    throw err;
  }
}

/**
 * Toast Notification System
 */
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  
  // Create container if it doesn't exist
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // Icon based on type (Using simple emojis to avoid external icon dependencies in app.js)
  const icon = type === 'success' ? '✅' : '⚠️';
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Trigger CSS transition animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 400); // Wait for transition to finish
  }, 3000);
}

/**
 * Modal Management
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Close modal when clicking outside of it (on the overlay)


document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

/**
 * Formatters
 */
function formatCurrency(amount) {
  return Number(amount).toLocaleString('ar-EG', {
    style: 'currency',
    currency: 'EGP'
  });
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('ar-EG', options);
}

/**
 * UI State Managers
 */
function renderSkeleton(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const isTable = container.tagName === 'TBODY';
  let html = '';
  
  for (let i = 0; i < count; i++) {
    if (isTable) {
      // Use colspan="100" to cover all possible table columns safely
      html += `<tr><td colspan="100"><div class="skeleton skeleton-text" style="height: 25px; margin: 0;"></div></td></tr>`;
    } else {
      html += `<div class="skeleton skeleton-text" style="height: 40px; margin-bottom: 10px;"></div>`;
    }
  }
  container.innerHTML = html;
}

// [FIX-B] Uses createElement + textContent to prevent XSS via message parameter
function renderEmptyState(containerId, message = 'لا توجد بيانات متاحة حالياً') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isTable = container.tagName === 'TBODY';

  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  const icon = document.createElement('span');
  icon.style.cssText = 'font-size: 3rem; opacity: 0.5; margin-bottom: 10px;';
  icon.textContent = '📭';

  const p = document.createElement('p');
  p.textContent = message; // textContent — never innerHTML

  wrapper.appendChild(icon);
  wrapper.appendChild(p);

  if (isTable) {
    const td = document.createElement('td');
    td.setAttribute('colspan', '100');
    td.appendChild(wrapper);
    const tr = document.createElement('tr');
    tr.appendChild(td);
    container.innerHTML = '';
    container.appendChild(tr);
  } else {
    container.innerHTML = '';
    container.appendChild(wrapper);
  }
}

// [FIX-1] XSS Protection — escapes all user-supplied strings before innerHTML injection
// [FIX-C] Accepts optional fallback parameter (defaults to '-' for table display)
function escapeHTML(str, fallback = '-') {
  if (str === null || str === undefined || str === '') return fallback;
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// [FIX-5] Custom Confirmation Modal — replaces native confirm() dialogs
// [FIX-A] Guards against missing DOM elements before accessing them
function showConfirmModal(message, onConfirm) {
  const msgEl = document.getElementById('confirm-message');
  const btn = document.getElementById('confirm-action-btn');

  if (!msgEl || !btn) {
    console.error('[showConfirmModal] confirm-modal HTML is missing from this page.');
    return;
  }

  msgEl.textContent = message;
  // Remove any previous listener before attaching a new one
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    closeModal('confirm-modal');
    onConfirm();
  });
  openModal('confirm-modal');
}

async function initLayout() {
  if (typeof window.loadLayout === 'function') {
    await window.loadLayout();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLayout);
} else {
  initLayout();
}
