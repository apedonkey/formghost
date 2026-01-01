const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// __dirname is always the directory containing this file (formghost-site)
const siteDir = __dirname;

// Serve static files
app.use(express.static(siteDir));

// Handle SPA-style routing - serve index.html for unknown routes
app.get('*', (req, res) => {
  // Check if requesting a specific file
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(siteDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FormGhost site running on port ${PORT}`);
});
