const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const uiJsPath = path.join(distDir, 'ui.js');
const uiCssPath = path.resolve(__dirname, '..', 'src', 'ui', 'styles.css');
const outPath = path.join(distDir, 'ui.html');

const js = fs.readFileSync(uiJsPath, 'utf8');
const css = fs.existsSync(uiCssPath) ? fs.readFileSync(uiCssPath, 'utf8') : '';

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;

fs.writeFileSync(outPath, html);
console.log('Built', outPath, '(' + html.length + ' bytes)');
