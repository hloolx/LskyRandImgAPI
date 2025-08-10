const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 加密配置
const ENCRYPT_SECRET = process.env.ENCRYPT_SECRET || 'default-secret-change-this';
const SESSION_SECRET = process.env.SESSION_SECRET || 'session-secret-change-this';

// 加密解密函数
function encrypt(text) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(ENCRYPT_SECRET, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(ENCRYPT_SECRET, 'salt', 32);
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 生成Session ID
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// CORS配置 - 白名单
const corsOptions = {
  origin: function (origin, callback) {
    const whitelist = process.env.CORS_ORIGINS 
      ? process.env.CORS_ORIGINS.split(',').map(url => url.trim())
      : ['http://localhost:5173', 'http://localhost:3000'];
    
    // 允许没有origin的请求（比如Postman）
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('不允许的跨域请求来源'));
    }
  },
  credentials: true
};

// 限流配置
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15分钟
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // 限制100次请求
  message: '请求过于频繁，请稍后再试',
  standardHeaders: true,
  legacyHeaders: false,
});

// API限流（更严格）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'API请求过于频繁，请稍后再试'
});

// 中间件
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务 - 优先提供打包后的前端文件
app.use(express.static(path.join(__dirname, 'dist')));
// 兼容旧版本路径
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', limiter); // 应用限流到所有API路由

// 初始化数据库
const db = new sqlite3.Database('./database.db');

// 创建数据库表
db.serialize(() => {
  // 用户表 - 兼容旧表结构
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lsky_host TEXT NOT NULL,
    token TEXT UNIQUE,
    token_encrypted TEXT UNIQUE,
    nickname TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Session表 - 新增
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expire_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 相册表
  db.run(`CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    album_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 随机API表 - 添加使用次数字段
  db.run(`CREATE TABLE IF NOT EXISTS random_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    album_id TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    api_name TEXT,
    images TEXT,
    enabled BOOLEAN DEFAULT 1,
    use_count INTEGER DEFAULT 0,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // API使用记录表 - 记录详细的访问日志
  db.run(`CREATE TABLE IF NOT EXISTS api_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    referer TEXT,
    accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_id) REFERENCES random_apis (id) ON DELETE CASCADE
  )`);

  // 为旧表添加新字段（兼容性处理）
  db.run(`ALTER TABLE random_apis ADD COLUMN use_count INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('添加use_count字段失败:', err);
    }
  });
  
  db.run(`ALTER TABLE random_apis ADD COLUMN last_used_at DATETIME`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('添加last_used_at字段失败:', err);
    }
  });

  // 清理过期session（每小时运行）
  setInterval(() => {
    db.run('DELETE FROM sessions WHERE expire_at < datetime("now")', (err) => {
      if (err) console.error('清理过期session失败:', err);
    });
  }, 60 * 60 * 1000);
});

// Session认证中间件
const authMiddleware = (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId) {
    return res.status(401).json({ error: '未授权访问' });
  }

  db.get(
    'SELECT s.*, u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.session_id = ? AND s.expire_at > datetime("now")',
    [sessionId],
    (err, session) => {
      if (err || !session) {
        return res.status(401).json({ error: 'Session无效或已过期' });
      }
      
      // 将用户信息附加到请求对象
      req.user = {
        id: session.user_id,
        lsky_host: session.lsky_host,
        token: session.token,
        token_encrypted: session.token_encrypted,
        nickname: session.nickname
      };
      
      // 延长session过期时间（活跃用户）
      db.run(
        'UPDATE sessions SET expire_at = datetime("now", "+2 hours") WHERE session_id = ?',
        [sessionId]
      );
      
      next();
    }
  );
};

// 生成唯一的API Key
function generateApiKey() {
  return 'api_' + crypto.randomBytes(16).toString('hex');
}

// API路由

// 健康检查端点（用于Docker和负载均衡器）
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'random-image-api',
    version: '1.0.0'
  });
});

// 用户登录/注册 - 添加限流保护
app.post('/api/auth/login', apiLimiter, async (req, res) => {
  const { lskyHost, token } = req.body;

  if (!lskyHost || !token) {
    return res.status(400).json({ error: '请提供兰空图床链接和Token' });
  }

  try {
    console.log(`尝试登录 - 地址: ${lskyHost}, Token: ${token.substring(0, 10)}...`);
    
    // 验证token - 使用v1 API
    const response = await axios.get(`${lskyHost}/api/v1/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      proxy: false, // 禁用代理
      maxRedirects: 5,
      timeout: 30000 // 30秒超时
    });

    const userData = response.data.data;
    const nickname = userData.name || userData.nickname || '未知用户';
    
    // 加密token
    const tokenEncrypted = encrypt(token);
    
    // 检查用户是否存在（通过lsky_host或token查找）
    db.get('SELECT * FROM users WHERE lsky_host = ? OR token = ?', [lskyHost, token], (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: '数据库错误' });
      }

      const handleUserSession = (userId) => {
        // 生成新的session
        const sessionId = generateSessionId();
        const expireAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2小时后过期
        
        // 清除该用户的旧session
        db.run('DELETE FROM sessions WHERE user_id = ?', [userId], (err) => {
          if (err) console.error('清除旧session失败:', err);
          
          // 创建新session
          db.run(
            'INSERT INTO sessions (session_id, user_id, expire_at) VALUES (?, ?, ?)',
            [sessionId, userId, expireAt.toISOString()],
            (err) => {
              if (err) {
                return res.status(500).json({ error: '创建session失败' });
              }
              
              res.json({
                success: true,
                sessionId,
                user: {
                  id: userId,
                  nickname,
                  lsky_host: lskyHost
                }
              });
            }
          );
        });
      };

      if (existingUser) {
        // 更新用户信息（同时更新token和token_encrypted）
        db.run(
          'UPDATE users SET token = ?, token_encrypted = ?, nickname = ?, lsky_host = ? WHERE id = ?',
          [token, tokenEncrypted, nickname, lskyHost, existingUser.id],
          (err) => {
            if (err) {
              console.error('更新用户错误:', err);
              return res.status(500).json({ error: '更新用户信息失败' });
            }
            handleUserSession(existingUser.id);
          }
        );
      } else {
        // 创建新用户（同时保存token和token_encrypted）
        db.run(
          'INSERT INTO users (lsky_host, token, token_encrypted, nickname) VALUES (?, ?, ?, ?)',
          [lskyHost, token, tokenEncrypted, nickname],
          function(err) {
            if (err) {
              console.error('创建用户错误:', err);
              return res.status(500).json({ error: '创建用户失败' });
            }
            handleUserSession(this.lastID);
          }
        );
      }
    });
  } catch (error) {
    console.error('登录错误:', error.message);
    res.status(401).json({ error: 'Token验证失败，请检查兰空图床链接和Token是否正确' });
  }
});

// 用户登出
app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.body.sessionId;
  
  if (sessionId) {
    db.run('DELETE FROM sessions WHERE session_id = ?', [sessionId], (err) => {
      if (err) console.error('删除session失败:', err);
    });
  }
  
  res.json({ success: true });
});

// 获取用户相册列表 - 需要认证
app.get('/api/albums', authMiddleware, async (req, res) => {
  const user = req.user;
  
  try {
    // 解密token（如果有加密的就解密，否则使用明文）
    const token = user.token_encrypted ? decrypt(user.token_encrypted) : user.token;
    
    const response = await axios.get(`${user.lsky_host}/api/v1/albums`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      proxy: false, // 禁用代理
      maxRedirects: 5,
      timeout: 30000
    });

    const albums = response.data.data.data || [];
    
    // 同步相册到本地数据库
    for (const album of albums) {
      db.run(
        `INSERT OR REPLACE INTO albums (user_id, album_id, name, description, image_count) 
         VALUES (?, ?, ?, ?, ?)`,
        [user.id, album.id, album.name, album.intro || '', album.image_num || 0]
      );
    }

    res.json({ success: true, albums });
  } catch (error) {
    console.error('获取相册错误:', error.message);
    res.status(500).json({ error: '获取相册列表失败' });
  }
});

// 获取相册中的图片 - 需要认证
app.get('/api/albums/:albumId/images', authMiddleware, async (req, res) => {
  const { albumId } = req.params;
  const user = req.user;
  
  try {
    // 解密token（如果有加密的就解密，否则使用明文）
    const token = user.token_encrypted ? decrypt(user.token_encrypted) : user.token;
    
    const response = await axios.get(`${user.lsky_host}/api/v1/images`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      params: {
        albumId: albumId,
        per_page: 100
      },
      proxy: false, // 禁用代理
      maxRedirects: 5,
      timeout: 30000
    });

    const images = response.data.data.data || [];
    res.json({ success: true, images });
  } catch (error) {
    console.error('获取图片错误:', error.message);
    res.status(500).json({ error: '获取图片列表失败' });
  }
});

// 创建随机API - 需要认证
app.post('/api/random-api/create', authMiddleware, apiLimiter, async (req, res) => {
  const { albumId, apiName } = req.body;
  const user = req.user;
  
  if (!albumId || !apiName) {
    return res.status(400).json({ error: '请提供相册ID和API名称' });
  }
  
  try {
    // 解密token（如果有加密的就解密，否则使用明文）
    const token = user.token_encrypted ? decrypt(user.token_encrypted) : user.token;
    
    const response = await axios.get(`${user.lsky_host}/api/v1/images`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      params: {
        albumId: albumId,
        per_page: 100
      },
      proxy: false, // 禁用代理
      maxRedirects: 5,
      timeout: 30000
    });

    const images = response.data.data.data || [];
    // v1 API中图片URL在links.url字段
    const imageUrls = images.map(img => img.links.url);
    
    if (imageUrls.length === 0) {
      return res.status(400).json({ error: '相册中没有图片' });
    }

    const apiKey = generateApiKey();

    db.run(
      `INSERT INTO random_apis (user_id, album_id, api_key, api_name, images) 
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, albumId, apiKey, apiName, JSON.stringify(imageUrls)],
      function(err) {
        if (err) {
          return res.status(500).json({ error: '创建API失败' });
        }
        
        const apiUrl = `${req.protocol}://${req.get('host')}/api/random/${apiKey}`;
        
        res.json({
          success: true,
          api: {
            id: this.lastID,
            api_key: apiKey,
            api_name: apiName,
            api_url: apiUrl,
            image_count: imageUrls.length
          }
        });
      }
    );
  } catch (error) {
    console.error('创建API错误:', error.message);
    res.status(500).json({ error: '创建随机API失败' });
  }
});

// 获取用户的随机API列表 - 需要认证
app.get('/api/random-api/list', authMiddleware, (req, res) => {
  const user = req.user;
  
  db.all(
    'SELECT * FROM random_apis WHERE user_id = ? ORDER BY created_at DESC',
    [user.id],
    (err, apis) => {
      if (err) {
        return res.status(500).json({ error: '获取API列表失败' });
      }

      const apiList = apis.map(api => ({
        id: api.id,
        api_key: api.api_key,
        api_name: api.api_name,
        api_url: `${req.protocol}://${req.get('host')}/api/random/${api.api_key}`,
        enabled: api.enabled,
        use_count: api.use_count || 0,
        last_used_at: api.last_used_at,
        created_at: api.created_at,
        image_count: JSON.parse(api.images || '[]').length
      }));

      res.json({ success: true, apis: apiList });
    }
  );
});

// 随机图片API（公开访问，记录使用次数）
app.get('/api/random/:apiKey', (req, res) => {
  const { apiKey } = req.params;

  db.get(
    'SELECT * FROM random_apis WHERE api_key = ? AND enabled = 1',
    [apiKey],
    (err, api) => {
      if (err || !api) {
        return res.status(404).json({ error: 'API不存在或已禁用' });
      }

      const images = JSON.parse(api.images || '[]');
      if (images.length === 0) {
        return res.status(404).json({ error: '没有可用的图片' });
      }

      const randomImage = images[Math.floor(Math.random() * images.length)];
      
      // 记录使用次数
      db.run(
        'UPDATE random_apis SET use_count = use_count + 1, last_used_at = datetime("now") WHERE api_key = ?',
        [apiKey],
        (err) => {
          if (err) console.error('更新使用次数失败:', err);
        }
      );
      
      // 记录详细的访问日志
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';
      const referer = req.headers['referer'] || '';
      
      db.run(
        'INSERT INTO api_usage_logs (api_id, ip_address, user_agent, referer) VALUES (?, ?, ?, ?)',
        [api.id, ipAddress, userAgent, referer],
        (err) => {
          if (err) console.error('记录访问日志失败:', err);
        }
      );
      
      res.redirect(randomImage);
    }
  );
});

// 删除随机API - 需要认证
app.delete('/api/random-api/:apiId', authMiddleware, (req, res) => {
  const { apiId } = req.params;
  const user = req.user;

  db.run(
    'DELETE FROM random_apis WHERE id = ? AND user_id = ?',
    [apiId, user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '删除失败' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'API不存在或无权限删除' });
      }
      res.json({ success: true });
    }
  );
});

// 启用/禁用API - 需要认证
app.patch('/api/random-api/:apiId/toggle', authMiddleware, (req, res) => {
  const { apiId } = req.params;
  const { enabled } = req.body;
  const user = req.user;

  db.run(
    'UPDATE random_apis SET enabled = ? WHERE id = ? AND user_id = ?',
    [enabled ? 1 : 0, apiId, user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: '更新失败' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'API不存在或无权限操作' });
      }
      res.json({ success: true });
    }
  );
});

// 获取API使用统计 - 需要认证
app.get('/api/random-api/:apiId/stats', authMiddleware, (req, res) => {
  const { apiId } = req.params;
  const user = req.user;
  
  // 获取API基本信息和使用统计
  db.get(
    'SELECT * FROM random_apis WHERE id = ? AND user_id = ?',
    [apiId, user.id],
    (err, api) => {
      if (err || !api) {
        return res.status(404).json({ error: 'API不存在或无权限查看' });
      }
      
      // 获取最近7天的使用趋势
      db.all(
        `SELECT 
          date(accessed_at) as date,
          COUNT(*) as count
        FROM api_usage_logs
        WHERE api_id = ? AND accessed_at >= datetime('now', '-7 days')
        GROUP BY date(accessed_at)
        ORDER BY date DESC`,
        [apiId],
        (err, dailyStats) => {
          if (err) {
            console.error('获取统计数据失败:', err);
            dailyStats = [];
          }
          
          // 获取最近的访问记录
          db.all(
            `SELECT * FROM api_usage_logs 
            WHERE api_id = ? 
            ORDER BY accessed_at DESC 
            LIMIT 10`,
            [apiId],
            (err, recentLogs) => {
              if (err) {
                console.error('获取访问日志失败:', err);
                recentLogs = [];
              }
              
              res.json({
                success: true,
                stats: {
                  total_uses: api.use_count || 0,
                  last_used_at: api.last_used_at,
                  daily_stats: dailyStats,
                  recent_logs: recentLogs
                }
              });
            }
          );
        }
      );
    }
  );
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 所有其他路由返回前端应用（支持前端路由）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) {
      // 如果dist目录不存在，尝试public目录
      res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
          res.status(404).send('页面未找到，请先构建前端应用');
        }
      });
    }
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                  🚀 服务器启动成功                      ║
╠════════════════════════════════════════════════════════╣
║  访问地址: http://localhost:${PORT}                        ║
║  API地址:  http://localhost:${PORT}/api                    ║
║                                                        ║
║  已启用功能:                                           ║
║  ✅ Token加密存储                                      ║
║  ✅ Session认证                                        ║
║  ✅ CORS白名单                                         ║
║  ✅ 请求限流保护                                       ║
║  ✅ API使用统计                                        ║
╚════════════════════════════════════════════════════════╝
  `);
  
  // 检查是否有.env文件
  if (!require('fs').existsSync('.env')) {
    console.log(`
⚠️  警告: 未找到 .env 配置文件
请复制 .env.example 并重命名为 .env，然后修改其中的配置
    `);
  }
});