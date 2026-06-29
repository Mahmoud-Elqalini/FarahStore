# 🛒 Farah Store - POS System

A comprehensive Point of Sale (POS) system built for desktop environments using modern web technologies and the **Electron.js** framework. The application provides a seamless, fast, and responsive user experience, backed by a robust local database to ensure data security and stability.

---

## ✨ Key Features

- **🖥️ Standalone Desktop App:** Built with `Electron.js` to run smoothly as an independent application on Windows without requiring a web browser.
- **🗄️ Blazing Fast Local Database (SQLite):** Powered by `better-sqlite3` with `WAL` (Write-Ahead Logging) mode enabled for superior read/write performance and concurrent operation handling.
- **📦 Comprehensive Inventory Management:** Easily add products, organize them into categories, monitor low stock, and link them to respective suppliers.
- **👥 Customer & Supplier Management:** Maintain detailed records, contact information, and accounting histories for both customers and suppliers.
- **🧾 Billing & Installments System:** Supports full cash payments as well as custom installment plans for customers, tracking both overdue and settled payments efficiently.
- **🛡️ Advanced Backup & Restore System:**
  - **Smart Auto-Backup:** Automatically backs up the database upon closing the application if any changes were made.
  - **Atomic Restore:** Relies on a completely secure atomic restoration process that ensures the database never corrupts, even if the restore operation is unexpectedly interrupted.
  - **Smart Retention Strategy:** Protects your disk space by automatically keeping only the last `5` backup snapshots.
  - **Integrity Check:** The system actively prevents restoring from external, incomplete, or incompatible database schema versions.

---

## 📊 Metrics & Technical Achievements

The application was built with a strict focus on stability, performance, and code quality:

- 🧪 **100% Test Coverage:** A total of **20 Test Suites** and **126 Unit & Integration Tests (E2E)** were written and executed successfully using the `Jest` framework, covering all workflows from system initialization to complex transactions.
- ⚡ **High Performance:** Database query response times are measured in milliseconds thanks to integrated local APIs.
- 📐 **Data Safety:** Advanced error handling and safe exit strategies guarantee zero data loss during operations.

---

## 🛠️ Tech Stack

* **Frontend:** HTML, Vanilla JavaScript, Vanilla CSS (Lightweight, responsive, and eye-friendly UI).
* **Backend Engine:** Node.js & Express (Internal routing API).
* **Desktop Framework:** Electron.js.
* **Database:** SQLite (`better-sqlite3`).
* **Testing:** Jest & Supertest.

---

## 🚀 Installation & Setup

For Development Environment:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mahmoud-Elqalini/FarahStore.git
   cd FarahStore
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Run the Application:**
   ```bash
   npm start
   ```

4. **Run the Tests:**
   ```bash
   npm run test
   ```

---

## 📦 Build for Production

To generate the setup executable (`Setup.exe`) for distribution on Windows machines:

```bash
npm run build
```
The final application installer will be generated and placed inside the `dist/` directory.

---

## 🤝 Contributing
This project is open for future enhancements. Potential features could include integrating reporting charts, direct hardware printing support, or cloud-based backup synchronization.

---
**Crafted with love ❤️ by Mahmoud Elqalini to support local businesses and sales management.**
