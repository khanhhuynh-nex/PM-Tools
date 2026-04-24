const multer = require('multer');
const path = require('path');

function createUploader() {
    return multer({ dest: path.join(__dirname, '..', 'uploads') });
}

module.exports = { createUploader };
