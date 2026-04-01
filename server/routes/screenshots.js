const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tradeId = req.body.tradeId;
    const dir = path.join(__dirname, '..', '..', 'data', 'screenshots', String(tradeId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// POST /upload — upload up to 25 screenshots
router.post('/upload', upload.array('screenshots', 25), (req, res) => {
  try {
    const tradeId = req.body.tradeId;
    const paths = req.files.map(
      (f) => `/data/screenshots/${tradeId}/${f.filename}`
    );
    res.json({ paths });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:tradeId/:filename — delete a specific screenshot
router.delete('/:tradeId/:filename', (req, res) => {
  try {
    const filePath = path.join(
      __dirname, '..', '..', 'data', 'screenshots',
      req.params.tradeId, req.params.filename
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
