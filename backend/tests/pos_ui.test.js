/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.resolve(__dirname, '../../frontend/orders.html');
const jsPath = path.resolve(__dirname, '../../frontend/js/orders.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const jsCode = fs.readFileSync(jsPath, 'utf8');

describe('POS UI Logic Tests (orders.js)', () => {
  let ordersModule;

  beforeEach(() => {
    document.documentElement.innerHTML = html.toString();
    
    global.apiCall = jest.fn().mockImplementation((url) => {
      if (url === '/customers') {
        return Promise.resolve([
          { customer_id: 1, customer_name: 'أحمد صالح', phone: '01000000000', is_active: true },
          { customer_id: 2, customer_name: 'ياسر يحيى', phone: '01110000000', is_active: true }
        ]);
      }
      return Promise.resolve([]);
    });
    
    global.showToast = jest.fn();

    // Export internal state/functions from the script for testing
    const exportsStr = `
      return { 
        normalizeArabic, 
        loadCustomers, 
        selectCustomer, 
        handleCheckout,
        addToCart,
        getCustomersCache: () => customersCache,
        getSelectedCustomerId: () => selectedCustomerId
      };
    `;
    const func = new Function(jsCode + '\n' + exportsStr);
    ordersModule = func();
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('normalizeArabic unifies Arabic letters (Hamza, Taa Marbuta, Alef Maksura)', () => {
    expect(ordersModule.normalizeArabic('أحمد')).toBe('احمد');
    expect(ordersModule.normalizeArabic('اسامة')).toBe('اسامه');
    expect(ordersModule.normalizeArabic('يحيى')).toBe('يحيي');
    expect(ordersModule.normalizeArabic(null)).toBe('');
  });

  test('loadCustomers fetches and caches customers', async () => {
    await ordersModule.loadCustomers();
    const cache = ordersModule.getCustomersCache();
    expect(cache.length).toBe(2);
    expect(cache[0].customer_name).toBe('أحمد صالح');
  });

  test('selectCustomer correctly selects and deselects', async () => {
    await ordersModule.loadCustomers();
    
    // Select customer 1
    ordersModule.selectCustomer(1);
    expect(ordersModule.getSelectedCustomerId()).toBe(1);
    
    // Clicking the same customer deselects it
    ordersModule.selectCustomer(1);
    expect(ordersModule.getSelectedCustomerId()).toBe(null);
    
    // Selecting another customer
    ordersModule.selectCustomer(2);
    expect(ordersModule.getSelectedCustomerId()).toBe(2);
  });

  test('Recent Customers are properly stored in localStorage', async () => {
    await ordersModule.loadCustomers();
    ordersModule.selectCustomer(1);
    
    const recent = JSON.parse(localStorage.getItem('recent_customers'));
    expect(recent.length).toBe(1);
    expect(recent[0].customer_id).toBe(1);
  });

  test('DOM min attribute is set correctly on load for installment date', () => {
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);
    
    const dateInput = document.getElementById('installments-first-date');
    const today = new Date().toISOString().split('T')[0];
    expect(dateInput.min).toBe(today);
  });

  test('handleCheckout prevents selecting a past date for installments', async () => {
    // Add item to cart and select customer to pass initial validations
    ordersModule.addToCart({ product_id: 1, product_name: 'Test', selling_price: 100, stock_quantity: 10 });
    ordersModule.selectCustomer(1);
    
    // Set payment type to Installment
    document.querySelector('input[name="payment_type"][value="Installment"]').checked = true;
    document.getElementById('installments-months').value = 12;
    
    // Set past date
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    document.getElementById('installments-first-date').value = pastDate.toISOString().split('T')[0];
    
    await ordersModule.handleCheckout();
    
    expect(global.showToast).toHaveBeenCalledWith('عفواً، لا يمكن أن يكون تاريخ أول قسط في الماضي', 'error');
  });
});
