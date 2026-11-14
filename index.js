const express = require('express');
const fs = require('fs');
const pathModule = require('path');
const mime = require('mime-types');
const mysql = require('mysql2/promise');

const app = express();

// server configuration
const serverConfigData = fs.readFileSync('/opt/storage/server.json', 'utf-8');
const serverConfig = JSON.parse(serverConfigData);
const dbHost = serverConfig.database?.host || '';
const dbUser = serverConfig.database?.user || '';
const dbPassword = serverConfig.database?.password || '';

// db
const pool = mysql.createPool({
  host: dbHost,
  port: 3306,
  user: dbUser,
  password: dbPassword,
  database: 'speedcubingsystem',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// configuration
const configPath = '/app/middleware-config.json';
let config = {};

function loadConfig() {
  try {
    const data = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(data);
    console.log('Config loaded:', config);
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

loadConfig();

fs.watchFile(configPath, (curr, prev) => {
  console.log('Config file changed, reloading...');
  loadConfig();
});

// app
app.use(async (req, res, next) => {
  // Next.js serves these itself and needs their query strings (e.g. ?slug= on /_next/data),
  // so leave them for the frontend instead of redirecting them without the query.
  if (req.path.startsWith('/_next/')) {
    return res.sendStatus(404);
  }

  const originalPath = req.path;
  const originalParam = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
  
  // start serve static file
  if (originalPath != '/') { // if query /, then skip

	// the folder we wants to serve
	let targetPath;
    try {
      targetPath = decodeURIComponent(originalPath);
    } catch {
      return res.sendStatus(404);
    }

    for (const staticDir of config.static) {

	  // 
      const fullPath = pathModule.join(staticDir, targetPath);
	  if (!fs.existsSync(fullPath)) {
        continue;
	  }

	  const file = fs.statSync(fullPath);

      if (file.isFile()) {
        if (req.query.dl === '1') {
          return res.download(fullPath);
        } else {
          return res.sendFile(fullPath, {
            headers: {
              'Content-Type': (mime.lookup(fullPath) || 'application/octet-stream'),
              'Content-Disposition': 'inline'
            }, dotfiles: 'allow'
          });
        }
      }
    }

  }
  
  let reqPath = originalPath;
  let param = originalParam;
  
  let rows = [];
  try {
    [rows] = await pool.query('SELECT target FROM web_redirect WHERE path = ?', [reqPath.slice(1)]);
  } catch (err) {
    console.error('MySQL query error:', err);
  }
  if (rows.length > 0) {
    const target = rows[0].target;
    return res.redirect(301, target);
  }

  if (reqPath !== '/' && reqPath.endsWith('/')) {
    reqPath = reqPath.slice(0, -1);
  }

  if (param && !(config.requireParameter?.[reqPath])) {
    param = '';
  }

  if (reqPath !== originalPath || param !== originalParam) {
	let redirectUrl = `https://${req.headers.host}${reqPath}`;
	
	if (param) {
	  redirectUrl += ('?' + param);
	}
    
	return res.redirect(301, redirectUrl);
  }

  res.sendStatus(404);
});

const server = app.listen(4000, '0.0.0.0', () => {
  console.log('Express middleware on http://0.0.0.0:4000');
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);

  server.close(async () => {
    console.log('HTTP server closed');

    try {
      await pool.end();
      console.log('MySQL pool closed');
    } catch (err) {
      console.error('Failed to close MySQL pool:', err);
    }

    process.exit(0);
  });

  // force exit if connections hang
  setTimeout(() => {
    console.error('Force shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM')); // docker stop
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
