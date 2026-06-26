// frontend/js/orders.js

// State
let cart = []; // Array of { product_id, product_name, selling_price, stock_quantity, quantity }
// stock_quantity: UI only — never trust for validation

let productsCache = [];
let customersCache = [];
let recentProducts = JSON.parse(localStorage.getItem('recent_products')) || [];
let recentCustomers = JSON.parse(localStorage.getItem('recent_customers')) || [];
let selectedCustomerId = null;
let debounceTimer;
let customerDebounceTimer;

// Setup default date validation (cannot select past dates)
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('installments-first-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }
});

function normalizeArabic(text) {
  if (!text) return '';
  return text.replace(/[أإآ]/g, 'ا')
             .replace(/ة/g, 'ه')
             .replace(/ى/g, 'ي')
             .toLowerCase().trim();
}

document.addEventListener('DOMContentLoaded', () => {
  loadCustomers();
  
  // Set default first due date (30 days from now)
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 30);
  document.getElementById('installments-first-date').valueAsDate = defaultDate;

  // Search Input listener
  const searchInput = document.getElementById('product-search');
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchProducts(e.target.value);
    }, 300);
  });
  
  // // TODO: implement Enter key shortcut
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      searchProducts(e.target.value, true);
    }
  });

  // Payment type toggle
  document.querySelectorAll('input[name="payment_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      document.getElementById('installment-fields').style.display = e.target.value === 'Installment' ? 'grid' : 'none';
    });
  });

  // Checkout btn
  document.getElementById('checkout-btn').addEventListener('click', handleCheckout);

  // Customer Search listener
  const customerSearchInput = document.getElementById('customer-search');
  customerSearchInput.addEventListener('input', (e) => {
    clearTimeout(customerDebounceTimer);
    customerDebounceTimer = setTimeout(() => {
      const q = normalizeArabic(e.target.value);
      if (!q) {
        renderCustomerGrid(recentCustomers);
        return;
      }
      const filtered = customersCache.filter(c => {
        const cName = normalizeArabic(c.customer_name);
        // TODO: normalize phone search (remove spaces and dashes for better matching)
        return cName.includes(q) || (c.phone && c.phone.includes(q));
      });
      renderCustomerGrid(filtered);
    }, 200);
  });

  // // TODO: persist cart to localStorage as fallback if browser closes unexpectedly
});

async function loadCustomers() {
  try {
    const res = await apiCall('/customers');
    const customers = Array.isArray(res) ? res : (res.data || []);
    customersCache = customers.filter(c => c.is_active !== false);
    
    const activeIds = new Set(customersCache.map(c => c.customer_id));
    recentCustomers = recentCustomers.filter(c => activeIds.has(c.customer_id));
    
    renderCustomerGrid(recentCustomers);
  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function renderCustomerGrid(customers) {
  const grid = document.getElementById('customer-grid');
  grid.innerHTML = '';

  if (customers.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">لا يوجد عملاء مطابقين</div>';
    return;
  }

  // Limit to 10 for performance if list is huge
  const displayList = customers.slice(0, 20);

  displayList.forEach(c => {
    const card = document.createElement('div');
    card.className = 'customer-card';
    if (selectedCustomerId === c.customer_id) {
      card.classList.add('selected');
    }
    card.onclick = () => selectCustomer(c.customer_id);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'customer-name';
    nameDiv.textContent = c.customer_name;

    const phoneDiv = document.createElement('div');
    phoneDiv.className = 'customer-phone';
    phoneDiv.textContent = c.phone ? `📞 ${c.phone}` : 'بدون رقم';

    card.appendChild(nameDiv);
    card.appendChild(phoneDiv);
    grid.appendChild(card);
  });
}

function selectCustomer(id) {
  if (selectedCustomerId === id) {
    // Deselect if clicked again
    selectedCustomerId = null;
  } else {
    selectedCustomerId = id;
    
    const customer = customersCache.find(c => c.customer_id === id);
    if (customer) {
      recentCustomers = recentCustomers.filter(c => c.customer_id !== id);
      recentCustomers.unshift(customer);
      if (recentCustomers.length > 3) recentCustomers.pop();
      localStorage.setItem('recent_customers', JSON.stringify(recentCustomers));
    }
  }
  
  // Re-render grid to update selected state
  const q = normalizeArabic(document.getElementById('customer-search').value);
  if (!q) {
    renderCustomerGrid(recentCustomers);
    return;
  }
  const filtered = customersCache.filter(c => {
    const cName = normalizeArabic(c.customer_name);
    // TODO: normalize phone search (remove spaces and dashes for better matching)
    return cName.includes(q) || (c.phone && c.phone.includes(q));
  });
  renderCustomerGrid(filtered);
}

async function searchProducts(query, isEnter = false) {
  if (!query || !query.trim()) {
    // TODO: recent_products prices may be stale — always fetch fresh price from API before using in production
    productsCache = recentProducts;
    renderCatalog();
    if (recentProducts.length === 0) {
      document.getElementById('catalog-grid').innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">ابحث بالاسم أو الباركود لإضافة منتجات...</div>';
    }
    return;
  }

  try {
    // limit=20 is required from day one
    // API supports /products/search?q=
    let url = `/products/search?q=${encodeURIComponent(query.trim())}`;
    const res = await apiCall(url);
    productsCache = res.data || res; // depending on if search returns array or {data: []}
    if (!Array.isArray(productsCache)) {
      productsCache = productsCache || [];
    }
    
    // Auto-add if exact match on Enter
    // assumes barcode scanner sends Enter key automatically
    // // TODO: barcode UX improvement
    if (isEnter && productsCache.length > 0) {
      const exactMatch = productsCache.find(p => p.barcode === query.trim() || p.sku === query.trim());
      if (exactMatch) {
        addToCart(exactMatch);
        document.getElementById('product-search').value = '';
        document.getElementById('catalog-grid').innerHTML = '';
        return;
      }
    }

    renderCatalog();
  } catch (err) {
    console.error('Error searching products:', err);
  }
}

function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  grid.innerHTML = '';
  
  if (productsCache.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">لا توجد منتجات مطابقة</div>';
    return;
  }

  productsCache.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.onclick = () => addToCart(p);
    
    // UI check for stock
    const isOutOfStock = p.stock_quantity <= 0;
    if (isOutOfStock) {
      card.style.opacity = '0.5';
      card.style.cursor = 'not-allowed';
      card.onclick = null;
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'product-name';
    nameDiv.textContent = p.product_name;

    const priceDiv = document.createElement('div');
    priceDiv.className = 'product-price';
    priceDiv.textContent = `${Number(p.selling_price).toFixed(2)} ج.م`;

    const stockDiv = document.createElement('div');
    stockDiv.className = 'product-stock';
    stockDiv.style.color = isOutOfStock ? '#e74c3c' : 'inherit';
    stockDiv.textContent = `المتاح: ${p.stock_quantity}`;

    card.appendChild(nameDiv);
    card.appendChild(priceDiv);
    card.appendChild(stockDiv);

    grid.appendChild(card);
  });
}

function addToCart(product) {
  if (product.stock_quantity <= 0) {
    showToast('المنتج غير متوفر في المخزون', 'error');
    return;
  }

  const existingItem = cart.find(item => item.product_id === product.product_id);
  
  if (existingItem) {
    if (existingItem.quantity < product.stock_quantity) {
      existingItem.quantity++;
    } else {
      showToast('لا يوجد مخزون كافي لإضافة المزيد', 'warning');
    }
  } else {
    cart.push({
      product_id: product.product_id,
      product_name: product.product_name,
      selling_price: Number(product.selling_price),
      stock_quantity: product.stock_quantity,
      quantity: 1
    });
  }
  
  // Save to recent products
  recentProducts = recentProducts.filter(p => p.product_id !== product.product_id);
  recentProducts.unshift(product);
  if (recentProducts.length > 3) recentProducts.pop();
  localStorage.setItem('recent_products', JSON.stringify(recentProducts));
  
  // If search is empty, re-render catalog to update recent
  if (!document.getElementById('product-search').value.trim()) {
    productsCache = recentProducts;
    renderCatalog();
  }
  
  renderCart();
}

function updateCartQty(productId, delta) {
  const item = cart.find(item => item.product_id === productId);
  if (!item) return;

  const newQty = item.quantity + delta;
  
  if (newQty <= 0) {
    cart = cart.filter(i => i.product_id !== productId);
  } else if (newQty > item.stock_quantity) {
    showToast('الكمية المطلوبة تتجاوز المخزون المتاح', 'warning');
  } else {
    item.quantity = newQty;
  }
  
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.product_id !== productId);
  renderCart();
}

function renderCart() {
  const tbody = document.getElementById('cart-tbody');
  tbody.innerHTML = '';

  if (cart.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">السلة فارغة</td></tr>';
    document.getElementById('cart-total').textContent = '0.00';
    return;
  }

  let total = 0;

  cart.forEach(item => {
    const itemTotal = item.quantity * item.selling_price;
    total += itemTotal;

    const tr = document.createElement('tr');
    
    const nameTd = document.createElement('td');
    nameTd.textContent = item.product_name;
    
    const priceTd = document.createElement('td');
    priceTd.textContent = item.selling_price.toFixed(2);
    
    const qtyTd = document.createElement('td');
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'qty-controls';
    
    const plusBtn = document.createElement('button');
    plusBtn.className = 'qty-btn';
    plusBtn.textContent = '+';
    plusBtn.disabled = item.quantity >= item.stock_quantity;
    plusBtn.onclick = () => updateCartQty(item.product_id, 1);
    
    const qtySpan = document.createElement('span');
    qtySpan.textContent = item.quantity;
    
    const minusBtn = document.createElement('button');
    minusBtn.className = 'qty-btn';
    minusBtn.textContent = '-';
    minusBtn.onclick = () => updateCartQty(item.product_id, -1);
    
    controlsDiv.appendChild(plusBtn);
    controlsDiv.appendChild(qtySpan);
    controlsDiv.appendChild(minusBtn);
    qtyTd.appendChild(controlsDiv);
    
    const totalTd = document.createElement('td');
    totalTd.textContent = itemTotal.toFixed(2);
    
    const actionTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = '🗑️';
    delBtn.onclick = () => removeFromCart(item.product_id);
    actionTd.appendChild(delBtn);

    tr.appendChild(nameTd);
    tr.appendChild(priceTd);
    tr.appendChild(qtyTd);
    tr.appendChild(totalTd);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });

  document.getElementById('cart-total').textContent = total.toFixed(2);
}

async function handleCheckout() {
  if (cart.length === 0) {
    showToast('السلة فارغة', 'warning');
    return;
  }

  if (!selectedCustomerId) {
    showToast('الرجاء تحديد العميل من القائمة بالأسفل', 'warning');
    return;
  }

  const paymentType = document.querySelector('input[name="payment_type"]:checked').value;
  const months = parseInt(document.getElementById('installments-months').value);
  const firstDueDate = document.getElementById('installments-first-date').value;

  if (paymentType === 'Installment') {
    if (!months || months < 1) {
      showToast('عدد الأشهر غير صحيح', 'warning');
      return;
    }
    if (!firstDueDate) {
      showToast('تاريخ أول قسط مطلوب', 'warning');
      return;
    }
    
    // Validate date is not in the past
    const selectedDate = new Date(firstDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // reset time to start of day for accurate comparison
    
    if (selectedDate < today) {
      showToast('عفواً، لا يمكن أن يكون تاريخ أول قسط في الماضي', 'error');
      return;
    }
  }

  const payload = {
    customer_id: parseInt(selectedCustomerId),
    payment_type: paymentType,
    items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity }))
  };

  if (paymentType === 'Installment') {
    payload.months = months;
    payload.first_due_date = firstDueDate;
  }

  const btn = document.getElementById('checkout-btn');
  btn.disabled = true;
  btn.textContent = 'جاري التنفيذ...';

  try {
    const res = await apiCall('/orders', 'POST', payload);
    
    // Show Receipt
    document.getElementById('receipt-invoice').textContent = res.invoice_number;
    document.getElementById('receipt-payment').textContent = res.payment_type === 'Cash' ? 'كاش' : 'تقسيط';
    document.getElementById('receipt-total').textContent = Number(res.total_amount).toFixed(2);
    document.getElementById('receipt-paid').textContent = Number(res.paid_amount).toFixed(2);
    document.getElementById('receipt-remaining').textContent = Number(res.remaining_balance).toFixed(2);
    
    document.getElementById('receipt-modal').classList.add('active');
    
    // We only reset cart when modal is closed
  } catch (err) {
    console.error('Checkout failed:', err);
    // Error is handled by apiCall toast (including specific DB message!)
    btn.disabled = false;
    btn.textContent = '✅ إتمام الطلب';
  }
}

function closeReceiptModal() {
  document.getElementById('receipt-modal').classList.remove('active');
  
  // Reset POS state
  cart = [];
  selectedCustomerId = null;
  renderCart();
  document.getElementById('customer-search').value = '';
  renderCustomerGrid(recentCustomers);
  document.querySelector('input[name="payment_type"][value="Cash"]').checked = true;
  document.getElementById('installment-fields').style.display = 'none';
  document.getElementById('product-search').value = '';
  productsCache = recentProducts;
  renderCatalog();
  if (recentProducts.length === 0) {
    document.getElementById('catalog-grid').innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">ابحث بالاسم أو الباركود لإضافة منتجات...</div>';
  }

  const btn = document.getElementById('checkout-btn');
  btn.disabled = false;
  btn.textContent = '✅ إتمام الطلب';
}
