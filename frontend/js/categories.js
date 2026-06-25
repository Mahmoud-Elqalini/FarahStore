let categoryToDeleteId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadCategories();

  const showInactiveCheckbox = document.getElementById('showInactive');
  if (showInactiveCheckbox) {
    showInactiveCheckbox.addEventListener('change', () => {
      loadCategories();
    });
  }
});

// Load all categories as cards
async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  const includeInactive = document.getElementById('showInactive')?.checked || false;

  // Show skeleton cards while loading
  grid.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    grid.innerHTML += `
      <div class="category-card">
        <div class="skeleton" style="width:70px; height:70px; border-radius:50%;"></div>
        <div class="skeleton skeleton-text" style="width:60%;"></div>
        <div class="skeleton skeleton-text" style="width:40%;"></div>
      </div>
    `;
  }

  try {
    const categories = await apiCall(`/categories?include_inactive=${includeInactive}`);

    if (categories.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1;">
          <div class="empty-state">
            <span style="font-size: 3rem; opacity: 0.5; margin-bottom: 10px;">📭</span>
            <p>لا توجد أقسام حالياً</p>
          </div>
        </div>
      `;
    } else {
      grid.innerHTML = '';
      categories.forEach(cat => {
        const isInactive = !cat.is_active;
        const cardClass = isInactive ? 'category-card inactive' : 'category-card';
        const badgeHtml = isInactive 
          ? `<span class="status-badge" style="background:#333; color:#aaa; font-size:0.8rem; margin-bottom:5px;">⚫ معطل</span>`
          : `<span class="status-badge" style="background:#10b98120; color:#10b981; font-size:0.8rem; margin-bottom:5px;">🟢 نشط</span>`;

        let actionHtml = '';
        if (isInactive) {
          actionHtml = `<button class="btn btn-secondary" style="color: var(--status-completed);" onclick="activateCategory(${cat.category_id})">تفعيل</button>`;
        } else {
          actionHtml = `<button class="btn btn-secondary" style="color: var(--status-cancelled);" onclick="openDeactivateModal(${cat.category_id}, '${escapeHTML(cat.category_name).replace(/'/g, "\\'")}')">تعطيل</button>`;
        }

        grid.innerHTML += `
          <div class="${cardClass}">
            <div class="category-card-actions">
              <button class="btn btn-secondary" onclick="openEditModal(${cat.category_id}, '${escapeHTML(cat.category_name).replace(/'/g, "\\'")}')">تعديل</button>
              ${actionHtml}
            </div>
            <div class="category-card-icon">F</div>
            ${badgeHtml}
            <div class="category-card-name">${escapeHTML(cat.category_name)}</div>
            <div class="category-card-count">${cat.product_count} منتج</div>
          </div>
        `;
      });
    }
  } catch (error) {
    console.error('Error loading categories:', error);
    grid.innerHTML = `
      <div style="grid-column: 1 / -1;">
        <div class="empty-state">
          <span style="font-size: 3rem; opacity: 0.5; margin-bottom: 10px;">❌</span>
          <p>حدث خطأ أثناء جلب البيانات</p>
        </div>
      </div>
    `;
  }
}

// Open modal for adding a new category
function openAddModal() {
  document.getElementById('modal-title').textContent = 'إضافة قسم';
  document.getElementById('category-id').value = '';
  document.getElementById('category-name').value = '';
  openModal('category-modal');
}

// Open modal for editing an existing category
function openEditModal(id, name) {
  document.getElementById('modal-title').textContent = 'تعديل قسم';
  document.getElementById('category-id').value = id;
  document.getElementById('category-name').value = name;
  openModal('category-modal');
}

// Save category (handles both add and edit)
async function saveCategory() {
  const id = document.getElementById('category-id').value;
  const category_name = document.getElementById('category-name').value.trim();

  if (!category_name) {
    showToast('اسم القسم مطلوب', 'error');
    return;
  }

  try {
    if (id) {
      // Edit mode
      await apiCall(`/categories/${id}`, 'PUT', { category_name });
      showToast('تم تعديل القسم بنجاح');
    } else {
      // Add mode
      await apiCall('/categories', 'POST', { category_name });
      showToast('تم إضافة القسم بنجاح');
    }

    closeModal('category-modal');
    loadCategories();
  } catch (error) {
    console.error('Error saving category:', error);
  }
}

function openDeactivateModal(id, name) {
  categoryToDeleteId = id;
  document.getElementById('deactivateCategoryName').textContent = name;
  openModal('deactivateModal');
}

function closeDeactivateModal() {
  closeModal('deactivateModal');
  categoryToDeleteId = null;
}

document.getElementById('btnConfirmDeactivate')?.addEventListener('click', async () => {
  if (!categoryToDeleteId) return;

  try {
    await apiCall(`/categories/${categoryToDeleteId}`, 'DELETE');
    showToast('تم تعطيل القسم بنجاح');
    closeDeactivateModal();
    loadCategories();
  } catch (error) {
    console.error('Error deactivating category:', error);
    closeDeactivateModal();
  }
});

async function activateCategory(id) {
  try {
    await apiCall(`/categories/${id}/activate`, 'PUT');
    showToast('تم تفعيل القسم بنجاح');
    loadCategories();
  } catch (error) {
    console.error('Error activating category:', error);
  }
}
