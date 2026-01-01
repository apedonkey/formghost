const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Handle SPA-style routing - serve index.html for unknown routes
app.get('*', (req, res) => {
  // Check if requesting a specific file
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FormGhost site running on port ${PORT}`);
});
