/**
 * Receipt Component
 * Builds and handles printing for a professional thermal POS receipt.
 */

const STORE_INFO = {
  name: 'FarahStore 💎',
  address: 'مشله بجانب المحطه، كفرالزيات، طنطا، الغربية',
  phone: '01019809455'
};

/**
 * Builds HTML for a receipt
 * @param {Object} order - The order object
 * @returns {string} - HTML string representing the receipt
 */
function buildReceipt(order) {
  const invoiceNo = order.invoice_number || `ORD-${order.order_id || 'N/A'}`;
  const cashierName = order.cashier_name || 'المدير'; // Default for now
  const customerName = order.customer_name || 'عميل نقدي';

  // Try to use server date, fallback to current
  let dateStr = '';
  if (order.order_date) {
    const d = new Date(order.order_date);
    dateStr = d.toLocaleString('ar-EG');
  } else {
    dateStr = new Date().toLocaleString('ar-EG');
  }

  const itemsHtml = (order.items || []).map(item => {
    const total = Number(item.quantity) * Number(item.unit_price);
    return `
      <tr>
        <td style="text-align: right; padding: 4px 0;">${item.product_name}</td>
        <td style="text-align: center; padding: 4px 0;">${item.quantity}</td>
        <td style="text-align: left; padding: 4px 0;">${total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const discount = Number(order.discount || 0);
  const tax = Number(order.tax || 0);
  const subtotal = Number(order.products_total || order.total_amount) - tax + discount;
  const total = Number(order.final_total || order.total_amount) || 0;
  const paid = Number(order.paid_amount || total);
  const remaining = total - paid;

  return `
    <div class="thermal-receipt" id="receipt-content">
      <div class="receipt-header" style="text-align: center; margin-bottom: 15px;">
        <h2 style="margin: 0; font-size: 1.4rem;">${STORE_INFO.name}</h2>
        <p style="margin: 2px 0; font-size: 0.9rem;">${STORE_INFO.address}</p>
        <p style="margin: 2px 0; font-size: 0.9rem;">ت: ${STORE_INFO.phone}</p>
      </div>
      
      <div class="receipt-meta" style="margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 3px;">
          <span>رقم الفاتورة:</span>
          <strong>${invoiceNo}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 3px;">
          <span>التاريخ:</span>
          <span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 3px;">
          <span>الكاشير:</span>
          <span>${cashierName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 3px;">
          <span>العميل:</span>
          <span>${customerName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 3px;">
          <span>طريقة الدفع:</span>
          <span>${order.payment_type === 'Cash' ? 'كاش' : 'قسط'}</span>
        </div>
      </div>

      <table style="width: 100%; font-size: 0.9rem; border-collapse: collapse; margin-bottom: 10px;">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="text-align: right; padding-bottom: 5px;">الصنف</th>
            <th style="text-align: center; padding-bottom: 5px;">الكمية</th>
            <th style="text-align: left; padding-bottom: 5px;">القيمة</th>
          </tr>
        </thead>
        <tbody style="border-bottom: 1px dashed #000;">
          ${itemsHtml}
        </tbody>
      </table>

      <div class="receipt-totals" style="font-size: 0.9rem; margin-bottom: 15px; padding-top: 5px;">
        ${discount > 0 || tax > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>المجموع الفرعي:</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        ` : ''}
        ${discount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>الخصم:</span>
          <span>-${discount.toFixed(2)}</span>
        </div>
        ` : ''}
        ${tax > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>الضريبة:</span>
          <span>+${tax.toFixed(2)}</span>
        </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1rem; margin-bottom: 3px; border-top: 1px solid #000; padding-top: 5px;">
          <span>الإجمالي للطباعة:</span>
          <span>${subtotal.toFixed(2)} ج.م</span>
        </div>
        
        ${order.payment_type === 'Installment' ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 0.85rem;">
          <span>المقدم:</span>
          <span>${Number(order.down_payment || 0).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 0.85rem;">
          <span>نسبة الفائدة:</span>
          <span>${Number(order.interest_rate || order.installment_rate || 0)}%</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 0.85rem;">
          <span>قيمة القسط الشهري:</span>
          <span>${Number(order.monthly_amount || 0).toFixed(2)}</span>
        </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1rem; margin-bottom: 3px; border-top: 1px dashed #000; padding-top: 5px;">
          <span>الإجمالي المطلوب:</span>
          <span>${total.toFixed(2)} ج.م</span>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>المدفوع:</span>
          <span>${paid.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>المتبقي:</span>
          <span>${remaining > 0 ? remaining.toFixed(2) : '0.00'}</span>
        </div>
      </div>

      <div class="receipt-footer" style="text-align: center; border-top: 1px dashed #000; padding-top: 10px;">
        <p style="margin: 0; font-size: 0.9rem; font-weight: bold;">شكراً لزيارتكم!</p>
        <p style="margin: 3px 0 0; font-size: 0.8rem;">نسعد بخدمتكم دائماً</p>
      </div>
    </div>
  `;
}

/**
 * Triggers the browser print dialog for the generated HTML.
 * The CSS will handle hiding everything else.
 */
function printReceipt(html) {
  // Inject into a dedicated print container in the body
  let printArea = document.getElementById('print-area');
  if (!printArea) {
    printArea = document.createElement('div');
    printArea.id = 'print-area';
    document.body.appendChild(printArea);
  }

  printArea.innerHTML = html;

  // Wait for DOM to update then print
  setTimeout(() => {
    window.print();
  }, 100);
}
