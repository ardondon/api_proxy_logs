const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * 初始化数据库和表结构
 */
async function initDatabase() {
  let connection;

  try {
    // 先连接MySQL服务器（不指定数据库）
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    console.log('✅ 连接到MySQL服务器成功');

    // 创建数据库
    const dbName = process.env.DB_NAME || 'api_proxy_logs';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ 数据库 ${dbName} 创建成功或已存在`);

    // 切换到目标数据库
    await connection.query(`USE \`${dbName}\``);

    // 创建API日志表（通用格式）
    const createLogTableSQL = `
      CREATE TABLE IF NOT EXISTS \`api_logs\` (
        \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
        \`request_id\` VARCHAR(64) NOT NULL COMMENT '请求唯一ID',
        \`request_method\` VARCHAR(10) DEFAULT NULL COMMENT '请求方法: GET/POST/PUT/DELETE等',
        \`request_url\` VARCHAR(1000) DEFAULT NULL COMMENT '请求URL',
        \`request_path\` VARCHAR(500) DEFAULT NULL COMMENT '请求路径',
        \`request_query\` TEXT COMMENT '查询参数（JSON）',
        \`request_headers\` TEXT COMMENT '请求头（JSON）',
        \`request_body\` MEDIUMTEXT COMMENT '请求体',
        \`response_status\` INT DEFAULT NULL COMMENT 'HTTP状态码',
        \`response_headers\` TEXT COMMENT '响应头（JSON）',
        \`response_body\` MEDIUMTEXT COMMENT '响应体',
        \`duration\` INT DEFAULT NULL COMMENT '请求耗时（毫秒）',
        \`success\` TINYINT(1) DEFAULT NULL COMMENT '请求成功: 1-成功, 0-失败',
        \`error_message\` VARCHAR(1000) DEFAULT NULL COMMENT '错误信息',
        \`ip_address\` VARCHAR(50) DEFAULT NULL COMMENT '客户端IP',
        \`user_agent\` VARCHAR(500) DEFAULT NULL COMMENT '用户代理',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        INDEX \`idx_request_id\` (\`request_id\`),
        INDEX \`idx_request_method\` (\`request_method\`),
        INDEX \`idx_request_path\` (\`request_path\`(255)),
        INDEX \`idx_response_status\` (\`response_status\`),
        INDEX \`idx_created_at\` (\`created_at\`),
        INDEX \`idx_success\` (\`success\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用API请求日志表';
    `;
    await connection.query(createLogTableSQL);
    console.log('✅ 表 api_logs 创建成功或已存在');

    // 创建统计表（通用格式）
    const createStatsTableSQL = `
      CREATE TABLE IF NOT EXISTS \`api_stats\` (
        \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
        \`date\` DATE NOT NULL COMMENT '统计日期',
        \`request_path\` VARCHAR(500) DEFAULT NULL COMMENT '请求路径',
        \`request_method\` VARCHAR(10) DEFAULT NULL COMMENT '请求方法',
        \`total_requests\` INT DEFAULT 0 COMMENT '总请求数',
        \`success_requests\` INT DEFAULT 0 COMMENT '成功请求数',
        \`failed_requests\` INT DEFAULT 0 COMMENT '失败请求数',
        \`avg_duration\` INT DEFAULT 0 COMMENT '平均耗时（毫秒）',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        UNIQUE KEY \`idx_date_path_method\` (\`date\`, \`request_path\`(255), \`request_method\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用API统计表';
    `;
    await connection.query(createStatsTableSQL);
    console.log('✅ 表 api_stats 创建成功或已存在');

    console.log('\n🎉 数据库初始化完成！');

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 执行初始化
initDatabase();
