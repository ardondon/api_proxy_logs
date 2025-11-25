const axios = require('axios');
const logger = require('../config/logger');
require('dotenv').config();

/**
 * 通用API代理服务 - 转发请求到目标API
 */
class ProxyService {
  constructor() {
    this.targetUrl = process.env.TARGET_API_URL;
  }

  /**
   * 转发请求到目标API（通用方法）
   * @param {object} params - 请求参数
   * @param {string} params.method - HTTP方法
   * @param {string} params.path - 请求路径
   * @param {object} params.headers - 请求头
   * @param {object} params.query - 查询参数
   * @param {any} params.body - 请求体
   * @returns {object} 响应结果和元数据
   */
  async forwardRequest({ method, path, headers, query, body }) {
    const startTime = Date.now();
    let response = null;
    let error = null;

    try {
      // 构建完整URL
      const url = this.targetUrl + path;
      logger.info(`转发请求: ${method} ${url}`);

      // 转发请求
      const axiosConfig = {
        method: method.toLowerCase(),
        url,
        headers: headers || {},
        params: query || {},
        timeout: 30000, // 30秒超时
      };

      // 只有非GET请求才添加body
      if (method.toUpperCase() !== 'GET' && body) {
        axiosConfig.data = body;
      }

      const axiosResponse = await axios(axiosConfig);
      response = axiosResponse;

      const duration = Date.now() - startTime;
      logger.info(`请求转发成功`, {
        duration: `${duration}ms`,
        status: response.status
      });

      return {
        success: true,
        request: {
          method,
          path,
          headers,
          query,
          body
        },
        response: {
          status: response.status,
          headers: response.headers,
          data: response.data
        },
        duration,
        error: null
      };

    } catch (err) {
      error = {
        message: err.message,
        code: err.code,
        status: err.response?.status
      };

      const duration = Date.now() - startTime;
      logger.error(`请求转发失败`, {
        duration: `${duration}ms`,
        error: error.message
      });

      return {
        success: false,
        request: {
          method,
          path,
          headers,
          query,
          body
        },
        response: {
          status: err.response?.status || null,
          headers: err.response?.headers || null,
          data: err.response?.data || null
        },
        duration,
        error
      };
    }
  }

  /**
   * 健康检查
   * @returns {boolean}
   */
  async healthCheck() {
    try {
      const response = await axios.get(this.targetUrl, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      logger.warn('目标API健康检查失败', { error: error.message });
      return false;
    }
  }
}

module.exports = new ProxyService();
