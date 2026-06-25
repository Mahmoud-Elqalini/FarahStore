let allCustomers = [];
let customerDebounceTimer;
let customerToDeactivateId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadCustomers();

  // Checkbox listener
  const showInactiveCheckbox = document.getElementById('showInactive');
  if (showInactiveCheckbox) {
    showInactiveCheckbox.addEventListener('change', () => {
      loadCustomers();
    });
  }

  // Event delegation
  document.getElementById('customers-table-body').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.action-edit');
    const deactivateBtn = e.target.closest('.action-deactivate');
    const activateBtn = e.target.closest('.action-activate');

    if (editBtn) openEditModal(editBtn.dataset.id);
    if (deactivateBtn) {
      customerToDeactivateId = deactivateBtn.dataset.id;
      const customerName = deactivateBtn.dataset.name;
      document.getElementById('deactivateCustomerName').textContent = customerName;
      openModal('deactivateModal');
    }
    if (activateBtn) activateCustomer(activateBtn.dataset.id);
  });
});

async function loadCustomers() {
  const loader = document.getElementById('table-loading');
  const includeInactive = document.getElementById('showInactive')?.checked || false;

  renderSkeleton('customers-table-body', 6);
  loader.classList.add('active');

  try {
    allCustomers = await apiCall(`/customers?include_inactive=${includeInactive}`);
    renderTable(allCustomers);
  } catch (error) {
    console.error('Error loading customers:', error);
    renderEmptyState('customers-table-body', 'حدث خطأ أثناء جلب البيانات ❌');
  } finally {
    loader.classList.remove('active');
  }
}

function renderTable(data, isSearching = false) {
  const tbody = document.getElementById('customers-table-body');
  if (data.length === 0) {
    const msg = isSearching
      ? 'لا توجد نتائج تطابق بحثك'
      : 'لا يوجد عملاء مسجلين حتى الآن — أضف أول عميل!';
    renderEmptyState('customers-table-body', msg);
  } else {
    tbody.innerHTML = data.map((cust, index) => {
      const isInactive = !cust.is_active;
      const trClass = isInactive ? 'class="inactive"' : '';
      const badgeHtml = isInactive 
        ? `<span class="status-badge" style="background:#333; color:#aaa; font-size:0.8rem;">⚫ معطل</span>`
        : `<span class="status-badge" style="background:#10b98120; color:#10b981; font-size:0.8rem;">🟢 نشط</span>`;
      
      let actionHtml = '';
      if (isInactive) {
        actionHtml = `<button class="btn btn-secondary action-activate" data-id="${cust.customer_id}" style="color: var(--status-completed);">تفعيل</button>`;
      } else {
        actionHtml = `<button class="btn btn-secondary action-deactivate" data-id="${cust.customer_id}" data-name="${escapeHTML(cust.customer_name).replace(/"/g, '&quot;')}" style="color: var(--status-cancelled);">تعطيل</button>`;
      }

      return `
        <tr ${trClass}>
          <td>${index + 1}</td>
          <td>${escapeHTML(cust.customer_name)}</td>
          <td>${badgeHtml}</td>
          <td>${escapeHTML(cust.phone)}</td>
          <td>${escapeHTML(cust.address || '')}</td>
          <td>${escapeHTML(cust.notes || '')}</td>
          <td>
            <button class="btn btn-secondary action-edit" data-id="${cust.customer_id}">تعديل</button>
            ${actionHtml}
          </td>
        </tr>
      `;
    }).join('');
  }
}

function handleSearch(event) {
  clearTimeout(customerDebounceTimer);
  customerDebounceTimer = setTimeout(() => {
    const value = event.target.value.toLowerCase().trim();
    const filteredData = allCustomers.filter(cust => 
      cust.customer_name.toLowerCase().includes(value) || 
      cust.phone.includes(value)
    );
    renderTable(filteredData, value.length > 0);
  }, 300);
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'إضافة عميل';
  document.getElementById('customer-id').value = '';
  document.getElementById('customer-name').value = '';
  document.getElementById('customer-phone').value = '';
  document.getElementById('customer-address').value = '';
  document.getElementById('customer-notes').value = '';
  openModal('customer-modal');
}

async function openEditModal(id) {
  try {
    const customer = await apiCall(`/customers/${id}`);
    document.getElementById('modal-title').textContent = 'تعديل عميل';
    document.getElementById('customer-id').value = customer.customer_id;
    document.getElementById('customer-name').value = customer.customer_name;
    document.getElementById('customer-phone').value = customer.phone || '';
    document.getElementById('customer-address').value = customer.address || '';
    document.getElementById('customer-notes').value = customer.notes || '';
    openModal('customer-modal');
  } catch (error) {
    console.error('Error fetching customer:', error);
    showToast('حدث خطأ أثناء جلب بيانات العميل، حاول مرة أخرى', 'error');
  }
}

async function saveCustomer() {
  const id = document.getElementById('customer-id').value;
  const customer_name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  const notes = document.getElementById('customer-notes').value.trim();

  if (!customer_name) {
    showToast('اسم العميل مطلوب', 'error');
    return;
  }
  if (!phone) {
    showToast('رقم هاتف العميل مطلوب', 'error');
    return;
  }

  const phoneRegex = /^[0-9]{10,15}$/;
  if (!phoneRegex.test(phone)) {
    showToast('رقم الهاتف يجب أن يحتوي على أرقام فقط (10-15 رقم)', 'error');
    return;
  }

  const body = { customer_name, phone, address, notes };

  try {
    if (id) {
      await apiCall(`/customers/${id}`, 'PUT', body);
      showToast('تم تعديل العميل بنجاح');
    } else {
      await apiCall('/customers', 'POST', body);
      showToast('تم إضافة العميل بنجاح');
    }

    closeModal('customer-modal');
    loadCustomers();
  } catch (error) {
    console.error('Error saving customer:', error);
  }
}

function closeDeactivateModal() {
  closeModal('deactivateModal');
  customerToDeactivateId = null;
}

document.getElementById('btnConfirmDeactivate')?.addEventListener('click', async () => {
  if (!customerToDeactivateId) return;

  try {
    await apiCall(`/customers/${customerToDeactivateId}`, 'DELETE');
    showToast('تم تعطيل العميل بنجاح');
    closeDeactivateModal();
    loadCustomers();
  } catch (error) {
    console.error('Error deactivating customer:', error);
    closeDeactivateModal();
  }
});

async function activateCustomer(id) {
  try {
    await apiCall(`/customers/${id}/activate`, 'PUT');
    showToast('تم تفعيل العميل بنجاح');
    loadCustomers();
  } catch (error) {
    console.error('Error activating customer:', error);
  }
}
