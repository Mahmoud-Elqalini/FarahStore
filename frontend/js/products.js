// products.js
const API_URL = 'http://localhost:3000/api';

// Memory Cache
let cachedCategories = [];
let cachedSuppliers = [];
let allProducts = [];

// DOM Elements
const productsTbody = document.getElementById('productsTbody');
const tableLoading = document.getElementById('tableLoading');
const emptyState = document.getElementById('emptyState');
const productsTable = document.getElementById('productsTable');
const searchInput = document.getElementById('searchInput');
const btnAddProduct = document.getElementById('btnAddProduct');
const showInactiveCheckbox = document.getElementById('showInactive');

// Form Modal Elements
const productModal = document.getElementById('productModal');
const productForm = document.getElementById('productForm');
const modalTitle = document.getElementById('modalTitle');
const btnSaveProduct = document.getElementById('btnSaveProduct');
const categorySelect = document.getElementById('categoryId');
const supplierSelect = document.getElementById('supplierId');
const skuGroup = document.getElementById('skuGroup');

// Restock Modal Elements
const restockModal = document.getElementById('restockModal');
const restockForm = document.getElementById('restockForm');
const btnConfirmRestock = document.getElementById('btnConfirmRestock');

// Deactivate Modal Elements
const deactivateModal = document.getElementById('deactivateModal');
const deactivateProductName = document.getElementById('deactivateProductName');
const btnConfirmDeactivate = document.getElementById('btnConfirmDeactivate');
let productToDeactivateId = null;

// Initial Load
document.addEventListener('DOMContentLoaded', async () => {
  showTableLoading();
  // Fetch dropdown data concurrently
  await Promise.all([fetchCategories(), fetchSuppliers()]);
  populateDropdowns();
  
  // Then fetch products
  await fetchProducts();
});

// --- Fetching Data ---
async function fetchCategories() {
  try {
    const res = await axios.get(`${API_URL}/categories`);
    cachedCategories = res.data;
  } catch (error) {
    showToast('فشل في تحميل قائمة الأقسام', 'error');
    console.error(error);
  }
}

async function fetchSuppliers() {
  try {
    const res = await axios.get(`${API_URL}/suppliers`);
    cachedSuppliers = res.data;
  } catch (error) {
    showToast('فشل في تحميل قائمة الموردين', 'error');
    console.error(error);
  }
}

function populateDropdowns() {
  // Categories
  categorySelect.innerHTML = '<option value="">-- اختر القسم --</option>';
  cachedCategories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.category_id;
    opt.textContent = c.category_name;
    categorySelect.appendChild(opt);
  });

  // Suppliers
  supplierSelect.innerHTML = '<option value="">-- اختر المورد --</option>';
  cachedSuppliers.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.supplier_id;
    opt.textContent = s.supplier_name;
    supplierSelect.appendChild(opt);
  });
}

async function fetchProducts() {
  try {
    showTableLoading();
    const includeInactive = showInactiveCheckbox.checked;
    const url = includeInactive
      ? `${API_URL}/products?include_inactive=true`
      : `${API_URL}/products`;
    const res = await axios.get(url);
    allProducts = res.data;
    renderTable(allProducts);
  } catch (error) {
    showToast('فشل في تحميل المنتجات', 'error');
    console.error(error);
  } finally {
    hideTableLoading();
  }
}

// --- Rendering ---
function renderTable(data) {
  productsTbody.innerHTML = '';
  if (data.length === 0) {
    productsTbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 30px; color:#999;">لا توجد منتجات مطابقة</td></tr>`;
    return;
  }

  data.forEach((p, index) => {
    const row = document.createElement('tr');
    if (!p.is_active) row.classList.add('row-inactive');

    const statusBadge = p.is_active
      ? '<span class="status-active">🟢 نشط</span>'
      : '<span class="status-inactive">⚫ معطل</span>';

    // Action buttons depend on is_active
    let actionButtons = '';
    if (p.is_active) {
      actionButtons = `
        <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.product_id})">تعديل</button>
        <button class="btn btn-secondary btn-sm" onclick="openRestockModal(${p.product_id})" style="color: var(--primary-color);">📦</button>
        <button class="btn btn-secondary btn-sm" onclick="confirmDeactivate(${p.product_id}, '${escapeHTML(p.product_name).replace(/'/g, "\\'")}')" style="color: var(--status-cancelled);">تعطيل</button>
      `;
    } else {
      actionButtons = `
        <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.product_id})">تعديل</button>
        <button class="btn btn-secondary btn-sm" onclick="activateProduct(${p.product_id})" style="color: var(--status-completed);">تفعيل</button>
      `;
    }

    row.innerHTML = `
      <td>${index + 1}</td>
      <td><code style="background:#f0f0f0; padding:2px 6px; border-radius:4px; font-size:0.85em;">${escapeHTML(p.sku || '-')}</code></td>
      <td><strong>${escapeHTML(p.product_name)}</strong></td>
      <td>${p.barcode ? escapeHTML(p.barcode) : '<span style="color:#999">-</span>'}</td>
      <td>${p.category_name ? escapeHTML(p.category_name) : '<span style="color:#999">-</span>'}</td>
      <td>${p.supplier_name ? escapeHTML(p.supplier_name) : '<span style="color:#999">-</span>'}</td>
      <td>${Number(p.purchase_price).toFixed(2)}</td>
      <td style="color:var(--primary-color); font-weight:600">${Number(p.selling_price).toFixed(2)}</td>
      <td>
        <span class="${p.stock_quantity <= 10 ? 'text-danger' : ''}" style="${p.stock_quantity <= 10 ? 'font-weight:bold' : ''}">
          ${p.stock_quantity}
        </span>
      </td>
      <td>${statusBadge}</td>
      <td style="white-space: nowrap;">${actionButtons}</td>
    `;
    productsTbody.appendChild(row);
  });
}

// --- Search / Filter ---
let searchTimeout;
searchInput.addEventListener('keyup', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const term = searchInput.value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!term) {
      renderTable(allProducts);
      return;
    }
    const filtered = allProducts.filter(p => 
      p.product_name.toLowerCase().includes(term) || 
      (p.barcode && p.barcode === searchInput.value.trim()) ||
      (p.sku && p.sku === searchInput.value.trim()) ||
      p.product_id.toString().includes(term)
    );
    renderTable(filtered);
  }, 300);
});

// Toggle inactive products
showInactiveCheckbox.addEventListener('change', () => {
  fetchProducts();
});

// --- Modal Management ---
function openProductModal() {
  productForm.reset();
  document.getElementById('productId').value = '';
  document.getElementById('productBarcode').value = '';
  modalTitle.textContent = 'إضافة منتج جديد';
  skuGroup.style.display = 'none'; // Hide SKU field for new products
  productModal.classList.add('active');
}

function closeProductModal() {
  productModal.classList.remove('active');
}

async function editProduct(id) {
  try {
    const res = await axios.get(`${API_URL}/products/${id}`);
    const p = res.data;

    document.getElementById('productId').value = p.product_id;
    document.getElementById('productName').value = p.product_name;
    document.getElementById('categoryId').value = p.category_id;
    document.getElementById('supplierId').value = p.supplier_id;
    document.getElementById('purchasePrice').value = p.purchase_price;
    document.getElementById('sellingPrice').value = p.selling_price;
    document.getElementById('stockQuantity').value = p.stock_quantity;
    document.getElementById('productBarcode').value = p.barcode || '';
    document.getElementById('productDescription').value = p.description || '';

    // Show SKU as read-only
    document.getElementById('productSku').value = p.sku || '';
    skuGroup.style.display = 'block';

    modalTitle.textContent = 'تعديل المنتج';
    productModal.classList.add('active');
  } catch (error) {
    handleError(error, 'فشل في تحميل بيانات المنتج');
  }
}

// --- Form Submission (POST/PUT) ---
productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('productId').value;
  const name = document.getElementById('productName').value.trim();
  const categoryId = document.getElementById('categoryId').value;
  const supplierId = document.getElementById('supplierId').value;
  const pPrice = parseFloat(document.getElementById('purchasePrice').value);
  const sPrice = parseFloat(document.getElementById('sellingPrice').value);
  const qty = parseInt(document.getElementById('stockQuantity').value);
  const barcode = document.getElementById('productBarcode').value.trim();
  const desc = document.getElementById('productDescription').value.trim();

  if (!name || !categoryId || !supplierId) {
    return showToast('يرجى تعبئة جميع الحقول الإلزامية', 'error');
  }
  
  if (isNaN(pPrice) || pPrice <= 0) return showToast('سعر الشراء يجب أن يكون أكبر من الصفر', 'error');
  if (isNaN(sPrice) || sPrice <= 0) return showToast('سعر البيع يجب أن يكون أكبر من الصفر', 'error');
  if (isNaN(qty) || qty < 0) return showToast('كمية المخزون غير صالحة', 'error');
  
  if (sPrice < pPrice) return showToast('سعر البيع لا يمكن أن يكون أقل من سعر الشراء', 'error');

  const payload = {
    product_name: name,
    category_id: categoryId,
    supplier_id: supplierId,
    purchase_price: pPrice,
    selling_price: sPrice,
    stock_quantity: qty,
    barcode: barcode || null,
    description: desc
  };

  try {
    btnSaveProduct.disabled = true;
    btnSaveProduct.textContent = 'جاري الحفظ...';

    if (id) {
      await axios.put(`${API_URL}/products/${id}`, payload);
      showToast('تم تحديث المنتج بنجاح', 'success');
    } else {
      const res = await axios.post(`${API_URL}/products`, payload);
      const newSku = res.data.data?.sku || '';
      showToast(`تمت إضافة المنتج بنجاح — كود SKU: ${newSku}`, 'success');
    }
    
    closeProductModal();
    await fetchProducts();
  } catch (error) {
    handleError(error, 'حدث خطأ أثناء حفظ المنتج');
  } finally {
    btnSaveProduct.disabled = false;
    btnSaveProduct.textContent = 'حفظ المنتج';
  }
});

// --- Restock Workflow ---
function openRestockModal(id) {
  const product = allProducts.find(p => p.product_id === id);
  if (!product) return;

  document.getElementById('restockProductId').value = id;
  document.getElementById('restockProductName').textContent = product.product_name;
  document.getElementById('restockCurrentQty').value = `${product.stock_quantity} وحدة`;
  document.getElementById('restockQuantity').value = '';
  document.getElementById('restockPurchasePrice').value = '';
  document.getElementById('restockSellingPrice').value = '';

  restockModal.classList.add('active');
}

function closeRestockModal() {
  restockModal.classList.remove('active');
}

restockForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('restockProductId').value;
  const quantity = parseInt(document.getElementById('restockQuantity').value);
  const purchasePrice = parseFloat(document.getElementById('restockPurchasePrice').value);
  const sellingPriceVal = document.getElementById('restockSellingPrice').value;
  const sellingPrice = sellingPriceVal ? parseFloat(sellingPriceVal) : null;

  if (!quantity || quantity <= 0) return showToast('الكمية المُضافة يجب أن تكون أكبر من الصفر', 'error');
  if (!purchasePrice || purchasePrice <= 0) return showToast('سعر الشراء يجب أن يكون أكبر من الصفر', 'error');

  try {
    btnConfirmRestock.disabled = true;
    btnConfirmRestock.textContent = 'جاري التخزين...';

    const res = await axios.post(`${API_URL}/products/${id}/restock`, {
      quantity,
      purchase_price: purchasePrice,
      selling_price: sellingPrice
    });

    const d = res.data.data;
    const added = res.data.added_quantity;

    showToast(
      `✅ تم إعادة التخزين بنجاح\n\nالكمية المُضافة: ${added} وحدة\nالمخزون الحالي: ${d.stock_quantity} وحدة\nمتوسط سعر الشراء: ${Number(d.purchase_price).toFixed(2)} ج.م`,
      'success'
    );

    closeRestockModal();
    await fetchProducts();
  } catch (error) {
    handleError(error, 'حدث خطأ أثناء إعادة التخزين');
  } finally {
    btnConfirmRestock.disabled = false;
    btnConfirmRestock.textContent = 'تأكيد إعادة التخزين';
  }
});

// --- Deactivate / Activate Workflow ---
function confirmDeactivate(id, name) {
  productToDeactivateId = id;
  deactivateProductName.textContent = name;
  deactivateModal.classList.add('active');
}

function closeDeactivateModal() {
  deactivateModal.classList.remove('active');
  productToDeactivateId = null;
}

btnConfirmDeactivate.addEventListener('click', async () => {
  if (!productToDeactivateId) return;
  
  try {
    btnConfirmDeactivate.disabled = true;
    btnConfirmDeactivate.textContent = 'جاري التعطيل...';
    
    await axios.delete(`${API_URL}/products/${productToDeactivateId}`);
    showToast('تم تعطيل المنتج بنجاح', 'success');
    closeDeactivateModal();
    await fetchProducts();
  } catch (error) {
    handleError(error, 'حدث خطأ أثناء تعطيل المنتج');
    closeDeactivateModal();
  } finally {
    btnConfirmDeactivate.disabled = false;
    btnConfirmDeactivate.textContent = 'تعطيل المنتج';
  }
});

async function activateProduct(id) {
  try {
    await axios.put(`${API_URL}/products/${id}/activate`);
    showToast('تم تفعيل المنتج بنجاح', 'success');
    await fetchProducts();
  } catch (error) {
    handleError(error, 'حدث خطأ أثناء تفعيل المنتج');
  }
}

// --- UI Helpers ---
function showTableLoading() {
  tableLoading.style.display = 'flex';
}
function hideTableLoading() {
  tableLoading.style.display = 'none';
}

function handleError(error, defaultMsg) {
  if (error.response && error.response.data && error.response.data.error_code) {
    const code = error.response.data.error_code;
    switch (code) {
      case 'FK_NOT_EXISTS':
        showToast('القسم أو المورد المختار غير صالح', 'error');
        break;
      case 'PRICE_LOGIC_ERROR':
        showToast('خطأ: سعر البيع أقل من الشراء', 'error');
        break;
      case 'NOT_FOUND':
        showToast('المنتج غير موجود', 'error');
        break;
      case 'INACTIVE_PRODUCT':
        showToast('لا يمكن إعادة تخزين منتج معطل', 'error');
        break;
      case 'DUPLICATE_BARCODE':
        showToast('هذا الباركود مستخدم لمنتج آخر', 'error');
        break;
      default:
        showToast(error.response.data.error || defaultMsg, 'error');
    }
  } else {
    showToast(defaultMsg, 'error');
  }
  console.error(error);
}
