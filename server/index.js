require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const tradesRouter = require('./routes/trades.js');
const aiRouter = require('./routes/ai.js');
const screenshotsRouter = require('./routes/screenshots.js');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));

// Serve screenshot files and other static data
app.use('/data', express.static(path.join(__dirname, '..', 'data')));

// Mount routes
app.use('/api/trades', tradesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/screenshots', screenshotsRouter);

// Serve static frontend build (Vite 'dist' folder)
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Fallback for React Router (SPA support)
app.get('*', (req, res) => {
  // Check if it's an API request first — if we reached here for /api, it's a 404
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`IC3 server running on http://localhost:${PORT}`);
});
