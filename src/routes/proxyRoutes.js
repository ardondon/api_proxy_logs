const express = require('express');
const router = express.Router();
const proxyService = require('../services/proxyService');
const logModel = require('../models/logModel');
const logger = require('../config/logger');

/**
 * 健康检查接口
 * GET /api/health
 */
router.get('/health', async (req, res) => {
  const isTargetHealthy = await proxyService.healthCheck();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    target: {
      healthy: isTargetHealthy,
      url: process.env.TARGET_API_URL
    }
  });
});

/**
 * 通用API代理转发处理器
 */
async function handleProxyRequest(req, res) {
  const requestId = logModel.generateRequestId();
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  
  logger.info(`收到${req.method}请求`, { requestId, path: req.path, ip: clientIp });

  try {
    // 转发请求
    const result = await proxyService.forwardRequest({
      method: req.method,
      path: req.path,
      headers: req.headers,
      query: req.query,
      body: req.body
    });

    // 先返回响应
    if (result.success) {
      // 设置响应头
      Object.keys(result.response.headers || {}).forEach(key => {
        res.setHeader(key, result.response.headers[key]);
      });
      // 设置状态码并返回数据
      res.status(result.response.status).send(result.response.data);
    } else {
      // 原样传递错误响应
      if (result.response) {
        // 设置响应头
        Object.keys(result.response.headers || {}).forEach(key => {
          res.setHeader(key, result.response.headers[key]);
        });
        // 设置状态码并返回错误数据
        res.status(result.response.status).send(result.response.data);
      } else {
        // 连接失败等网络错误，返回500
        res.status(500).send(result.error.message);
      }
    }

    // 返回响应后再异步保存日志
    setImmediate(async () => {
      try {
        await logModel.saveLog({
          requestId,
          requestMethod: req.method,
          requestUrl: req.originalUrl,
          requestPath: req.path,
          requestQuery: req.query,
          requestHeaders: req.headers,
          requestBody: req.body,
          responseStatus: result.response.status,
          responseHeaders: result.response.headers,
          responseBody: result.response.data,
          duration: result.duration,
          success: result.success,
          errorMessage: result.error ? result.error.message : null,
          ipAddress: clientIp,
          userAgent
        });
      } catch (error) {
        logger.error(`异步保存日志失败`, { error: error.message });
      }
    });

  } catch (error) {
    logger.error(`请求处理异常`, { requestId, error: error.message });
    res.status(500).json({
      error: '服务器内部错误',
      message: error.message
    });
  }
}

/**
 * 导出处理器供 app.js 使用
 * 在 app.js 中作为最后的通配符路由
 */
module.exports = router;
module.exports.forwardAllRequests = handleProxyRequest;
