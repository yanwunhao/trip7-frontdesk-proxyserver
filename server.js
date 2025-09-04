const https = require('https');
const http = require('http');
const fs = require('fs');
const url = require('url');

// Load configuration file
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// CORS handling function
function handleCORS(req, res) {
  const origin = req.headers.origin;
  
  if (config.cors.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  if (config.cors.allowCredentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', config.cors.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', config.cors.allowedHeaders.join(', '));
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return true;
  }
  
  return false;
}

// Proxy request function
function proxyRequest(req, res) {
  // Handle CORS
  if (handleCORS(req, res)) {
    return; // Preflight request handled
  }
  
  // Check if origin is allowed for proxying
  const origin = req.headers.origin;
  if (origin && !config.cors.allowedOrigins.includes(origin)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: "傻逼吧你！" }));
    return;
  }
  
  const targetUrl = url.parse(config.proxy.target);
  
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 80,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host
    }
  };
  
  console.log(`[PROXY] ${req.method} ${req.url} -> ${config.proxy.target}${req.url}`);
  
  const proxyReq = http.request(options, (proxyRes) => {
    // Copy response headers
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    
    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('[PROXY ERROR]', err.message);
    res.writeHead(500);
    res.end('Proxy Error');
  });
  
  req.pipe(proxyReq);
}

// Start HTTPS server
try {
  const options = {
    key: fs.readFileSync(config.ssl.keyPath),
    cert: fs.readFileSync(config.ssl.certPath)
  };
  
  const server = https.createServer(options, proxyRequest);
  
  server.listen(config.proxy.port, config.proxy.host, () => {
    console.log(`🚀 HTTPS proxy server running on https://${config.proxy.host}:${config.proxy.port}`);
    console.log(`📡 Proxy target: ${config.proxy.target}`);
    console.log(`🌐 Allowed origins:`, config.cors.allowedOrigins);
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down proxy server...');
    server.close(() => {
      process.exit(0);
    });
  });
  
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  console.log('Please check SSL certificate paths');
  process.exit(1);
}