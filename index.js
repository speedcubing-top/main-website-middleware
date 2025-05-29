const express = require('express');
const fs = require('fs');
const pathModule = require('path');
const mysql = require('mysql2/promise');

const app = express();

// server configuration
const serverConfigData = fs.readFileSync('/opt/storage/server.json', 'utf-8');
const serverConfig = JSON.parse(serverConfigData);
const dbUser = serverConfig.database?.user || '';
const dbPassword = serverConfig.database?.password || '';
const domain = serverConfig.domain;

// db
const pool = mysql.createPool({
  host: 'mariadb',
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
  const originalPath = req.path;
  const originalHost = req.headers.host;
  const originalParam = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
  
  let path = req.path;
  let host = req.headers.host;
  let param = originalParam;
  
  // serve static file
  for (const staticDir of config.static) {
    const fullPath = pathModule.join(staticDir, decodeURIComponent(path));
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
	  if (req.query.dl === '1') {
	    return res.download(fullPath);
	  } else {
        return res.sendFile(fullPath);
	  }
    }
  }
  
  const [rows] = await pool.query('SELECT target FROM web_redirect WHERE path = ?', [path.slice(1)]); 
  if (rows.length > 0) {
    const target = rows[0].target;
    return res.redirect(301, target);
  }

  if (host && host === 'www.' + domain) {
    host = domain;
  }

  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  if (param && !(config.requireParameter?.[path])) {
    param = '';
  }

  if (path !== originalPath || host !== originalHost || param !== originalParam) {
	let redirectUrl = `https://${host}${path}`;
	
	if (param) {
	  redirectUrl += ('?' + param);
	}
    
	return res.redirect(301, redirectUrl);
  }

  res.sendStatus(404);
});

app.listen(4000, '0.0.0.0', () => {
  console.log('Express middleware on http://0.0.0.0:4000');
});
