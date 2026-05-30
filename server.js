require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());

// Home dashboard
app.use('/', express.static(path.join(__dirname, 'public')));

// Tool UIs
app.use('/epicor', express.static(path.join(__dirname, 'tools/epicor/public')));
app.use('/celoxis', express.static(path.join(__dirname, 'tools/celoxis/public')));

// Tool API routes
app.use('/api/epicor', require('./tools/epicor/router'));
app.use('/api/celoxis', require('./tools/celoxis/router'));

app.listen(PORT, () => {
    console.log(`\n  PM Automation Hub running at http://localhost:${PORT}\n`);
});
