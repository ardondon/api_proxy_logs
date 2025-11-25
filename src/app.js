const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const logger = require('./config/logger');
const { testConnection } = require('./config/database');
const proxyRoutes = require('./routes/proxyRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: true, limit: '16mb' }));

// HTTP请求日志
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// 管理后台主页 - 单独保护
app.get('/api_proxy_logs/admin.html', (req, res, next) => {
  // 导入adminRoutes的basicAuth
  const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
      return res.status(401).json({ error: '需要认证' });
    }
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    const validUsername = process.env.ADMIN_USERNAME || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (username === validUsername && password === validPassword) {
      next();
    } else {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
      return res.status(401).json({ error: '认证失败' });
    }
  };
  basicAuth(req, res, () => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
  });
});

// 管理后台路由（避免与代理冲突）
app.use('/api_proxy_logs/admin', adminRoutes);
app.use('/api_proxy_logs', proxyRoutes); // 健康检查等

// 静态文件服务放在最后，只处理未匹配的路径
app.use('/api_proxy_logs', express.static(path.join(__dirname, '../public')));


// 通用API代理（放在最后，匹配所有其他路径）
const { forwardAllRequests } = require('./routes/proxyRoutes');
app.all('*', forwardAllRequests);


// 错误处理
app.use((err, req, res, next) => {
  logger.error('服务器错误', {
    error: err.message,
    stack: err.stack
  });

  // 处理请求体过大错误
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request Entity Too Large',
      message: '请求体超过16MB限制'
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
async function startServer() {
  try {
    // 测试数据库连接
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.warn('数据库连接失败，但服务器将继续启动');
    }

    app.listen(PORT, () => {
      logger.info(`🚀 服务器启动成功`);
      logger.info(`📡 端口: ${PORT}`);
      logger.info(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🎯 目标API: ${process.env.TARGET_API_URL}`);
      logger.info(`📊 管理后台: http://localhost:${PORT}/api_proxy_logs/admin.html`);
      logger.info(`💡 健康检查: http://localhost:${PORT}/api_proxy_logs/health`);
      logger.info(`🔀 API代理: http://localhost:${PORT}/* (转发所有其他请求)`);
    });
  } catch (error) {
    logger.error('服务器启动失败', { error: error.message });
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

// 启动
startServer();

module.exports = app;
