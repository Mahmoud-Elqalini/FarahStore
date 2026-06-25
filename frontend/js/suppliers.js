let allSuppliers = [];
let supplierDebounceTimer;
let supplierToDeactivateId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadSuppliers();

  // Checkbox listener
  const showInactiveCheckbox = document.getElementById('showInactive');
  if (showInactiveCheckbox) {
    showInactiveCheckbox.addEventListener('change', () => {
      loadSuppliers();
    });
  }

  // Event delegation
  document.getElementById('suppliers-table-body').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.action-edit');
    const deactivateBtn = e.target.closest('.action-deactivate');
    const activateBtn = e.target.closest('.action-activate');

    if (editBtn) openEditModal(editBtn.dataset.id);
    if (deactivateBtn) {
      supplierToDeactivateId = deactivateBtn.dataset.id;
      const supplierName = deactivateBtn.dataset.name;
      document.getElementById('deactivateSupplierName').textContent = supplierName;
      openModal('deactivateModal');
    }
    if (activateBtn) activateSupplier(activateBtn.dataset.id);
  });
});

async function loadSuppliers() {
  const loader = document.getElementById('table-loading');
  const includeInactive = document.getElementById('showInactive')?.checked || false;

  renderSkeleton('suppliers-table-body', 4);
  loader.classList.add('active');

  try {
    allSuppliers = await apiCall(`/suppliers?include_inactive=${includeInactive}`);
    renderTable(allSuppliers);
  } catch (error) {
    console.error('Error loading suppliers:', error);
    renderEmptyState('suppliers-table-body', 'حدث خطأ أثناء جلب البيانات ❌');
  } finally {
    loader.classList.remove('active');
  }
}

function renderTable(data, isSearching = false) {
  const tbody = document.getElementById('suppliers-table-body');
  if (data.length === 0) {
    const msg = isSearching
      ? 'لا توجد نتائج تطابق بحثك'
      : 'لا يوجد موردين مسجلين حتى الآن — أضف أول مورد!';
    renderEmptyState('suppliers-table-body', msg);
  } else {
    tbody.innerHTML = data.map((sup, index) => {
      const isInactive = !sup.is_active;
      const trClass = isInactive ? 'class="inactive"' : '';
      const badgeHtml = isInactive 
        ? `<span class="status-badge" style="background:#333; color:#aaa; font-size:0.8rem;">⚫ معطل</span>`
        : `<span class="status-badge" style="background:#10b98120; color:#10b981; font-size:0.8rem;">🟢 نشط</span>`;
      
      let actionHtml = '';
      if (isInactive) {
        actionHtml = `<button class="btn btn-secondary action-activate" data-id="${sup.supplier_id}" style="color: var(--status-completed);">تفعيل</button>`;
      } else {
        actionHtml = `<button class="btn btn-secondary action-deactivate" data-id="${sup.supplier_id}" data-name="${escapeHTML(sup.supplier_name).replace(/"/g, '&quot;')}" style="color: var(--status-cancelled);">تعطيل</button>`;
      }

      return `
        <tr ${trClass}>
          <td>${index + 1}</td>
          <td>${escapeHTML(sup.supplier_name)}</td>
          <td>${badgeHtml}</td>
          <td>${escapeHTML(sup.phone || '')}</td>
          <td>${escapeHTML(sup.address || '')}</td>
          <td>${escapeHTML(sup.notes || '')}</td>
          <td>
            <button class="btn btn-secondary action-edit" data-id="${sup.supplier_id}">تعديل</button>
            ${actionHtml}
          </td>
        </tr>
      `;
    }).join('');
  }
}

function handleSearch(event) {
  clearTimeout(supplierDebounceTimer);
  supplierDebounceTimer = setTimeout(() => {
    const value = event.target.value.toLowerCase().trim();
    const filteredData = allSuppliers.filter(sup => 
      sup.supplier_name.toLowerCase().includes(value)
    );
    renderTable(filteredData, value.length > 0);
  }, 300);
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'إضافة مورد';
  document.getElementById('supplier-id').value = '';
  document.getElementById('supplier-name').value = '';
  document.getElementById('supplier-phone').value = '';
  document.getElementById('supplier-address').value = '';
  document.getElementById('supplier-notes').value = '';
  openModal('supplier-modal');
}

async function openEditModal(id) {
  try {
    const supplier = await apiCall(`/suppliers/${id}`);
    document.getElementById('modal-title').textContent = 'تعديل مورد';
    document.getElementById('supplier-id').value = supplier.supplier_id;
    document.getElementById('supplier-name').value = supplier.supplier_name;
    document.getElementById('supplier-phone').value = supplier.phone || '';
    document.getElementById('supplier-address').value = supplier.address || '';
    document.getElementById('supplier-notes').value = supplier.notes || '';
    openModal('supplier-modal');
  } catch (error) {
    console.error('Error fetching supplier:', error);
    showToast('حدث خطأ أثناء جلب بيانات المورد، حاول مرة أخرى', 'error');
  }
}

async function saveSupplier() {
  const id = document.getElementById('supplier-id').value;
  const supplier_name = document.getElementById('supplier-name').value.trim();
  const phone = document.getElementById('supplier-phone').value.trim();
  const address = document.getElementById('supplier-address').value.trim();
  const notes = document.getElementById('supplier-notes').value.trim();

  if (!supplier_name) {
    showToast('اسم المورد مطلوب', 'error');
    return;
  }

  const body = { supplier_name, phone, address, notes };

  try {
    if (id) {
      await apiCall(`/suppliers/${id}`, 'PUT', body);
      showToast('تم تعديل المورد بنجاح');
    } else {
      await apiCall('/suppliers', 'POST', body);
      showToast('تم إضافة المورد بنجاح');
    }

    closeModal('supplier-modal');
    loadSuppliers();
  } catch (error) {
    console.error('Error saving supplier:', error);
  }
}

function closeDeactivateModal() {
  closeModal('deactivateModal');
  supplierToDeactivateId = null;
}

document.getElementById('btnConfirmDeactivate')?.addEventListener('click', async () => {
  if (!supplierToDeactivateId) return;

  try {
    await apiCall(`/suppliers/${supplierToDeactivateId}`, 'DELETE');
    showToast('تم تعطيل المورد بنجاح');
    closeDeactivateModal();
    loadSuppliers();
  } catch (error) {
    console.error('Error deactivating supplier:', error);
    closeDeactivateModal();
  }
});

async function activateSupplier(id) {
  try {
    await apiCall(`/suppliers/${id}/activate`, 'PUT');
    showToast('تم تفعيل المورد بنجاح');
    loadSuppliers();
  } catch (error) {
    console.error('Error activating supplier:', error);
  }
}
