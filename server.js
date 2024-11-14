const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'frontend', 'build')));

// API routes (you can add your Node.js API routes here if needed)
app.get('/api', (req, res) => {
  res.json({ message: 'Hello from Node.js!' });
});

// Serve the React app for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
