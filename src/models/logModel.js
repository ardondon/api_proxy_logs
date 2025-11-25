const { pool } = require('../config/database');
const logger = require('../config/logger');

/**
 * 通用API日志数据模型
 */
class LogModel {
  /**
   * 保存API日志（通用格式）
   * @param {object} logData - 日志数据
   */
  async saveLog(logData) {
    const {
      requestId = this.generateRequestId(),
      requestMethod,
      requestUrl,
      requestPath,
      requestQuery,
      requestHeaders,
      requestBody,
      responseStatus,
      responseHeaders,
      responseBody,
      duration,
      success,
      errorMessage,
      ipAddress,
      userAgent
    } = logData;

    const sql = `
      INSERT INTO api_logs (
        request_id, request_method, request_url, request_path, request_query,
        request_headers, request_body, response_status, response_headers,
        response_body, duration, success, error_message, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [
        requestId || '',
        requestMethod || '',
        requestUrl || '',
        requestPath || '',
        requestQuery ? JSON.stringify(requestQuery) : null,
        requestHeaders ? JSON.stringify(requestHeaders) : null,
        this.stringifyBody(requestBody),
        responseStatus || null,
        responseHeaders ? JSON.stringify(responseHeaders) : null,
        this.stringifyBody(responseBody),
        duration || 0,
        success !== undefined ? (success ? 1 : 0) : 0,
        errorMessage || null,
        ipAddress || '',
        userAgent || ''
      ]);

      logger.info(`日志保存成功`, { requestId, logId: result.insertId });
      return result.insertId;
    } catch (error) {
      logger.error(`日志保存失败`, { error: error.message });
      throw error;
    }
  }

  /**
   * 查询日志列表（通用格式）
   * @param {object} params - 查询参数
   */
  async getLogs(params = {}) {
    try {
      // 参数预处理和验证
      const page = Math.max(1, parseInt(params.page) || 1);
      const pageSize = Math.max(1, Math.min(100, parseInt(params.pageSize) || 20));
      
      console.log('🔍 Input params:', params);
      
      // 构建基础查询
      let whereClause = 'WHERE 1=1';
      const queryParams = [];
      
      // 安全地添加查询条件
      if (params.requestMethod && params.requestMethod.trim()) {
        console.log(`🔍 Adding requestMethod filter: ${params.requestMethod.trim()}`);
        whereClause += ' AND request_method = ?';
        queryParams.push(params.requestMethod.trim());
      }
      
      if (params.requestPath && params.requestPath.trim()) {
        console.log(`🔍 Adding requestPath filter: %${params.requestPath.trim()}%`);
        whereClause += ' AND request_path LIKE ?';
        queryParams.push(`%${params.requestPath.trim()}%`);
      }
      
      if (params.responseStatus !== undefined && params.responseStatus !== null && params.responseStatus !== '') {
        const statusValue = parseInt(params.responseStatus);
        console.log(`🔍 Adding responseStatus filter: ${params.responseStatus} -> ${statusValue}`);
        whereClause += ' AND response_status = ?';
        queryParams.push(statusValue);
      }
      
      if (params.success !== undefined && params.success !== null && params.success !== '') {
        const successValue = params.success === 'true' || params.success === true ? 1 : 0;
        console.log(`🔍 Adding success filter: ${params.success} -> ${successValue}`);
        whereClause += ' AND success = ?';
        queryParams.push(successValue);
      }
      
      if (params.startDate && params.startDate.trim()) {
        // datetime-local格式: "2025-11-25T00:00" 转为 "2025-11-25 00:00:00"
        const startDateTime = params.startDate.trim().replace('T', ' ') + ':00';
        console.log(`🔍 Adding startDate filter: ${params.startDate.trim()} -> ${startDateTime}`);
        whereClause += ' AND created_at >= ?';
        queryParams.push(startDateTime);
      }
      
      if (params.endDate && params.endDate.trim()) {
        // datetime-local格式: "2025-11-25T23:59" 转为 "2025-11-25 23:59:00"
        const endDateTime = params.endDate.trim().replace('T', ' ') + ':00';
        console.log(`🔍 Adding endDate filter: ${params.endDate.trim()} -> ${endDateTime}`);
        whereClause += ' AND created_at <= ?';
        queryParams.push(endDateTime);
      }

      console.log('🔍 Where clause:', whereClause);
      console.log('🔍 Query params:', queryParams);
      
      // 先查询总数
      const countSql = `SELECT COUNT(*) as total FROM api_logs ${whereClause}`;
      console.log('🔍 Count SQL:', countSql);
      console.log('🔍 Count placeholders:', (countSql.match(/\?/g) || []).length);
      console.log('🔍 Count params length:', queryParams.length);
      
      // 使用pool.query()替代pool.execute()解决兼容性问题
      const [countResult] = await pool.query(countSql, queryParams);
      const total = countResult[0].total;
      
      // 分页查询 - 使用字符串插值而非prepared statement
      const offset = (page - 1) * pageSize;
      const finalSql = `SELECT * FROM api_logs ${whereClause} ORDER BY created_at DESC LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`;
      
      console.log('🔍 Final SQL:', finalSql);
      console.log('🔍 Final params:', queryParams);

      const [rows] = await pool.query(finalSql, queryParams);

      return {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        data: rows
      };
      
    } catch (error) {
      console.error('❌ getLogs error:', error.message);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * 获取统计数据（通用格式）
   * @param {object} params - 统计参数
   */
  async getStats(params = {}) {
    const { startDate, endDate, requestPath, requestMethod } = params;

    let sql = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_requests,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
        AVG(duration) as avg_duration
      FROM api_logs
      WHERE 1=1
    `;
    const queryParams = [];

    if (startDate) {
      sql += ' AND created_at >= ?';
      queryParams.push(startDate);
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      queryParams.push(endDate);
    }
    if (requestPath) {
      sql += ' AND request_path LIKE ?';
      queryParams.push(`%${requestPath}%`);
    }
    if (requestMethod) {
      sql += ' AND request_method = ?';
      queryParams.push(requestMethod);
    }

    sql += ' GROUP BY DATE(created_at) ORDER BY date DESC';

    const [rows] = await pool.execute(sql, queryParams);
    return rows;
  }

  /**
   * 获取状态码分布统计
   */
  async getStatusCodeStats(params = {}) {
    const { startDate, endDate } = params;
    
    let sql = `
      SELECT 
        response_status as status_code,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM api_logs WHERE created_at >= ? AND created_at <= ?), 2) as percentage
      FROM api_logs 
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY response_status 
      ORDER BY count DESC
    `;
    
    const queryParams = [startDate || '1970-01-01', endDate || '2030-12-31', startDate || '1970-01-01', endDate || '2030-12-31'];
    const [rows] = await pool.query(sql, queryParams);
    return rows;
  }

  /**
   * 获取热门API路径统计
   */
  async getTopApiPaths(params = {}) {
    const { startDate, endDate, limit = 10 } = params;
    
    let sql = `
      SELECT 
        request_path,
        COUNT(*) as count,
        AVG(duration) as avg_duration,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
        ROUND(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
      FROM api_logs 
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY request_path 
      ORDER BY count DESC 
      LIMIT ?
    `;
    
    const queryParams = [startDate || '1970-01-01', endDate || '2030-12-31', parseInt(limit)];
    const [rows] = await pool.query(sql, queryParams);
    return rows;
  }

  /**
   * 获取请求趋势（按小时）
   */
  async getHourlyTrend(params = {}) {
    const { startDate, endDate } = params;
    
    let sql = `
      SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as count,
        AVG(duration) as avg_duration
      FROM api_logs 
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY HOUR(created_at) 
      ORDER BY hour
    `;
    
    const queryParams = [startDate || '1970-01-01', endDate || '2030-12-31'];
    const [rows] = await pool.query(sql, queryParams);
    return rows;
  }

  /**
   * 生成请求ID
   */
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  
  /**
   * 将请求体/响应体转为字符串
   */
  stringifyBody(body) {
    if (body === null || body === undefined) {
      return null;
    }
    
    let str;
    if (typeof body === 'string') {
      str = body;
    } else {
      try {
        str = JSON.stringify(body);
      } catch (e) {
        str = String(body);
      }
    }
    
    // 检查数据大小，超过16MB标记为"数据过大"
    const maxSize = 16 * 1024 * 1024; // 16MB
    if (Buffer.byteLength(str, 'utf8') > maxSize) {
      return '数据过大';
    }
    
    return str;
  }
}

module.exports = new LogModel();
