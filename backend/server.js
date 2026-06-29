const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));

// Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Database connection
require("./config/db");

// Routes
const categoriesRoutes = require("./routes/categories");
app.use("/api/categories", categoriesRoutes);

const suppliersRoutes = require("./routes/suppliers");
app.use("/api/suppliers", suppliersRoutes);

const customersRoutes = require("./routes/customers");
app.use("/api/customers", customersRoutes);

const productsRoutes = require("./routes/products");
app.use("/api/products", productsRoutes);

const ordersRoutes = require("./routes/orders");
app.use("/api/orders", ordersRoutes);

const installmentsRoutes = require("./routes/installments");
app.use("/api/installments", installmentsRoutes);

const dashboardRoutes = require("./routes/dashboard");
app.use("/api/dashboard", dashboardRoutes);

// Global Error Handler Middleware
const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      console.log(`Embedded server running on dynamic port ${port}`);
      
      const shutdownServer = () => {
        return new Promise((closeResolve, closeReject) => {
          server.close((err) => {
            if (err) closeReject(err);
            else closeResolve();
          });
        });
      };
      
      resolve({ port, shutdownServer });
    }).on('error', reject);
  });
}

app.startServer = startServer;
module.exports = app;
