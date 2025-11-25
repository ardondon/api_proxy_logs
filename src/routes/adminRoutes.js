const express = require('express');
const path = require('path');
const router = express.Router();
const logModel = require('../models/logModel');
const logger = require('../config/logger');

/**
 * 简单的认证中间件
 */
function basicAuth(req, res, next) {
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
}

/**
 * 查询日志列表（通用格式）
 * GET /admin/logs
 */
router.get('/logs', basicAuth, async (req, res) => {
  try {
    console.log('🔍 Frontend query params:', req.query);
    
    const params = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 20,
      requestMethod: req.query.requestMethod,
      requestPath: req.query.requestPath,
      responseStatus: req.query.responseStatus ? parseInt(req.query.responseStatus) : undefined,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      success: req.query.success !== undefined ? req.query.success === 'true' : undefined
    };
    
    console.log('🔍 Processed params for getLogs:', params);

    const result = await logModel.getLogs(params);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('查询日志失败', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 查询统计数据（通用格式）
 * GET /admin/stats
 */
router.get('/stats', basicAuth, async (req, res) => {
  try {
    const params = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      requestPath: req.query.requestPath,
      requestMethod: req.query.requestMethod
    };

    const stats = await logModel.getStats(params);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('查询统计失败', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取今日概览
 * GET /admin/overview
 */
router.get('/overview', basicAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stats = await logModel.getStats({
      startDate: `${today} 00:00:00`,
      endDate: `${today} 23:59:59`
    });

    const todayStats = stats[0] || {
      total_requests: 0,
      success_requests: 0,
      failed_requests: 0,
      avg_duration: 0
    };

    res.json({
      success: true,
      data: {
        today: today,
        totalRequests: todayStats.total_requests,
        successRequests: todayStats.success_requests,
        failedRequests: todayStats.failed_requests,
        avgDuration: Math.round(todayStats.avg_duration),
        successRate: todayStats.total_requests > 0 
          ? ((todayStats.success_requests / todayStats.total_requests) * 100).toFixed(2) 
          : 0
      }
    });
  } catch (error) {
    logger.error('查询概览失败', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取状态码分布统计
 * GET /admin/stats/status-codes
 */
router.get('/stats/status-codes', basicAuth, async (req, res) => {
  try {
    const params = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const stats = await logModel.getStatusCodeStats(params);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('查询状态码统计失败', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取热门API路径统计
 * GET /admin/stats/top-paths
 */
router.get('/stats/top-paths', basicAuth, async (req, res) => {
  try {
    const params = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: parseInt(req.query.limit) || 10
    };
    
    const stats = await logModel.getTopApiPaths(params);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('查询热门路径统计失败', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取请求趋势（按小时）
 * GET /admin/stats/hourly-trend
 */
router.get('/stats/hourly-trend', basicAuth, async (req, res) => {
  try {
    const params = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const stats = await logModel.getHourlyTrend(params);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('查询小时趋势统计失败', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
