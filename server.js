const express = require('express');
const app = express();
const requireParameter = new Set(["/forceredirect", "/redirect", "/login"]);

app.use((req, res, next) => {
  let pathname = req.path;
  const search = req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : '';
  const host = req.headers.host;

  let redirectNeeded = false;

  if (host && host.startsWith('www.')) {
    redirectNeeded = true;
  }

  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
    redirectNeeded = true;
  }

  let newUrl = pathname;
  if (search && requireParameter.has(pathname)) {
    newUrl += search;
  } else if (search && !requireParameter.has(pathname)) {
    redirectNeeded = true;
  }

  if (redirectNeeded) {
    const redirectUrl = `http://mc2:83${newUrl}`;
    console.log('Redirect:', redirectUrl);
    return res.redirect(301, redirectUrl);
  }

  res.sendStatus(404); // or res.end()
});

app.listen(4000, '0.0.0.0', () => {
  console.log('Express middleware on http://0.0.0.0:4000');
});
