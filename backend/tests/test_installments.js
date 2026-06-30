// Native fetch is available in node 18+
const sqlite3 = require('better-sqlite3');

const db = sqlite3('../database/farahstore.db');
const PORT = 3000;
const API_URL = `http://localhost:${PORT}/api/orders`;

// 1. Get a valid customer and product
const customer = db.prepare('SELECT customer_id FROM customers WHERE is_active = 1 LIMIT 1').get();
const product = db.prepare('SELECT product_id, selling_price, stock_quantity FROM products WHERE is_active = 1 LIMIT 1').get();

if (!customer || !product) {
  console.error("❌ Need at least 1 active customer and 1 active product to run tests.");
  process.exit(1);
}

// Make sure product has enough stock
db.prepare('UPDATE products SET stock_quantity = 1000 WHERE product_id = ?').run(product.product_id);

async function runTest(testName, payload, expected) {
  console.log(`\n================================`);
  console.log(`▶️ RUNNING TEST: ${testName}`);
  console.log(`📦 Payload:`, JSON.stringify(payload));

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      console.log(`❌ Request failed: ${JSON.stringify(data)}`);
      return false;
    }

    console.log(`✅ Request succeeded! Order ID: ${data.order_id}`);
    
    let passed = true;
    for (const [key, value] of Object.entries(expected)) {
      if (Math.abs(data[key] - value) > 0.01) { // float comparison
        console.log(`❌ Mismatch in ${key}: Expected ${value}, Got ${data[key]}`);
        passed = false;
      } else {
        console.log(`✅ ${key} matches (${value})`);
      }
    }
    
    // Also verify the database installments
    if (payload.payment_type === 'Installment') {
      const installments = db.prepare('SELECT * FROM installments WHERE order_id = ? ORDER BY installment_number').all(data.order_id);
      console.log(`📊 DB Installments created: ${installments.length}`);
      
      const totalAmountInDB = installments.reduce((sum, inst) => sum + inst.amount, 0);
      const expectedDebt = data.total_amount - data.down_payment;
      
      if (Math.abs(totalAmountInDB - expectedDebt) > 0.01) {
        console.log(`❌ Mismatch in DB installments total: Expected ${expectedDebt}, Got ${totalAmountInDB}`);
        passed = false;
      } else {
        console.log(`✅ DB installments total matches expected debt (${expectedDebt})`);
      }
    }

    if (passed) {
      console.log(`✅ TEST PASSED`);
    } else {
      console.log(`❌ TEST FAILED`);
    }

    return passed;
  } catch (err) {
    console.error(`❌ Test crashed: ${err.message}`);
    return false;
  }
}

async function main() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const firstDueDate = tomorrow.toISOString().split('T')[0];

  const price = product.selling_price; // Let's say 1500
  const qty = 4;
  const productsTotal = price * qty; // 6000

  const basePayload = {
    customer_id: customer.customer_id,
    payment_type: 'Installment',
    items: [{ product_id: product.product_id, quantity: qty }],
    first_due_date: firstDueDate
  };

  // Test 1: User Case (Price 6000, Down 2000, 10% Interest, 6 months)
  // Remaining = 4000
  // Interest = 400
  // Installment Debt = 4400
  // Monthly = 733.33
  // Final Total = 6400
  await runTest("الحالة الأولى: نفس بيانات العميل (6000 إجمالي، 2000 مقدم، 10% فائدة، 6 شهور)", {
    ...basePayload,
    months: 6,
    down_payment: 2000,
    interest_rate: 10
  }, {
    products_total: productsTotal,
    down_payment: 2000,
    interest_rate: 10,
    months: 6,
    total_amount: productsTotal + ((productsTotal - 2000) * 0.10), // 6400
    monthly_amount: ((productsTotal - 2000) * 1.10) / 6 // 4400 / 6 = 733.333
  });

  // Test 2: 0% Interest
  // Price 6000, Down 2000, 0% Interest, 4 months
  // Remaining = 4000
  // Debt = 4000
  // Monthly = 1000
  await runTest("الحالة الثانية: بدون فائدة (0%)", {
    ...basePayload,
    months: 4,
    down_payment: 2000,
    interest_rate: 0
  }, {
    products_total: productsTotal,
    down_payment: 2000,
    interest_rate: 0,
    months: 4,
    total_amount: productsTotal, 
    monthly_amount: (productsTotal - 2000) / 4 
  });

  // Test 3: 0 Down Payment
  // Price 6000, Down 0, 15% Interest, 5 months
  // Remaining = 6000
  // Debt = 6000 + 900 = 6900
  // Monthly = 6900 / 5 = 1380
  await runTest("الحالة الثالثة: بدون مقدم (0 ج.م)", {
    ...basePayload,
    months: 5,
    down_payment: 0,
    interest_rate: 15
  }, {
    products_total: productsTotal,
    down_payment: 0,
    interest_rate: 15,
    months: 5,
    total_amount: productsTotal * 1.15,
    monthly_amount: (productsTotal * 1.15) / 5
  });

  // Test 4: Cash Order (no installments)
  await runTest("الحالة الرابعة: طلب كاش", {
    customer_id: customer.customer_id,
    payment_type: 'Cash',
    items: [{ product_id: product.product_id, quantity: qty }]
  }, {
    products_total: productsTotal,
    total_amount: productsTotal,
    paid_amount: productsTotal,
    remaining_balance: 0
  });

  console.log("\n✅ ALL TESTS COMPLETED.");
}

main();
