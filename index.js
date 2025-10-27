const express = require('express');
const fs = require('fs');
const pathModule = require('path');
const mime = require('mime-types');
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

function formatFileTime(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function createFileInfo(stat, file) {

  let displayName = file;

  // Directory behavior
  if (stat.isDirectory()) {
    if (file.length < 50) {
      displayName = file + "/";
	  } else if (file.length == 50) {
	    displayName = file
    }
  }

  // ..>
  if (file.length > 50) {
    displayName = file.slice(0, 47) + '..>';
  }

  return {
    name: displayName,
	padding: ' '.repeat(50 - displayName.length),
    time: formatFileTime(stat.mtime), 
    size: (stat.isDirectory() ? '           -' : String(stat.size).padStart(12, ' '))
  };
}

function renderFileList(res, folderPath, urlPath) {
  const files = fs.readdirSync(folderPath);
  const fileArr = [];

  if (!/^\/[^/]+$/.test(urlPath)) {
    const parent = pathModule.dirname(urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath);
    fileArr.push({path: parent === '.' ? '/' : parent + '/', info: {name: '../'}});
  }

  files.forEach(file => {
    const fullPath = pathModule.join(folderPath, file);
    const stat = fs.statSync(fullPath);

    const info = createFileInfo(stat, file);

    if (stat.isDirectory()) {
      fileArr.push({path: pathModule.join(urlPath, file) + '/', info: info});
    } else {
      fileArr.push({path: pathModule.join(urlPath, file), info: info});
    }
  });

  res.render('index.ejs', {
	  currentPath : urlPath,
	  fileArr: fileArr
  })
}

// app
app.use(async (req, res, next) => {
  const originalPath = req.path;
  const originalHost = req.headers.host;
  const originalParam = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';

  const decodedPath = decodeURIComponent(originalPath);
  
  // serve static file
  if (originalPath != '/') {
	let targetPath = decodedPath; // the folder we wants to see
	if (originalPath == '/index') {
	  targetPath = '/'
	}

    for (const staticDir of config.static) {
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
            }
          });
        }
      } else if (file.isDirectory()) {
        return renderFileList(res, fullPath, targetPath);
	  }
    }
  }
  
  let path = originalPath;
  let host = req.headers.host;
  let param = originalParam;
  
  let rows = [];
  try {
    [rows] = await pool.query('SELECT target FROM web_redirect WHERE path = ?', [path.slice(1)]);
  } catch (err) {
    console.error('MySQL query error:', err);
  }
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
