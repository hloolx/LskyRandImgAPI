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

// 定时任务：每天12点更新所有用户的API数据
function scheduleDailyUpdate() {
  const now = new Date();
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  
  // 如果已经过了今天的12点，设置为明天12点
  if (now > noon) {
    noon.setDate(noon.getDate() + 1);
  }
  
  const msUntilNoon = noon - now;
  
  // 设置定时器
  setTimeout(() => {
    console.log('开始执行每日12点定时更新任务...');
    updateAllUsersAPIs();
    
    // 设置下一天的定时任务
    setInterval(updateAllUsersAPIs, 24 * 60 * 60 * 1000);  // 每24小时执行一次
  }, msUntilNoon);
  
  console.log(`定时任务已设置，将在 ${new Date(noon).toLocaleString()} 执行`);
}

// 更新所有用户的API数据
async function updateAllUsersAPIs() {
  console.log(`[${new Date().toLocaleString()}] 开始批量更新所有用户API数据...`);
  
  db.all(
    `SELECT DISTINCT u.*, COUNT(r.id) as api_count 
     FROM users u 
     JOIN random_apis r ON u.id = r.user_id 
     GROUP BY u.id`,
    async (err, users) => {
      if (err) {
        console.error('获取用户列表失败:', err);
        return;
      }
      
      console.log(`需要更新 ${users.length} 个用户的API数据`);
      
      for (const user of users) {
        try {
          const token = user.token_encrypted ? decrypt(user.token_encrypted) : user.token;
          
          // 获取该用户的所有API
          const apis = await new Promise((resolve, reject) => {
            db.all(
              'SELECT * FROM random_apis WHERE user_id = ?',
              [user.id],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              }
            );
          });
          
          console.log(`用户 ${user.id} 有 ${apis.length} 个API需要更新`);
          
          // 逐个更新（避免并发过多）
          for (const api of apis) {
            try {
              const response = await axios.get(`${user.lsky_host}/api/v1/images`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
                },
                params: {
                  albumId: api.album_id,
                  per_page: 1
                },
                proxy: false,
                maxRedirects: 5,
                timeout: 10000
              });
              
              const total = response.data?.data?.total || 0;
              
              // 更新数据库
              db.run(
                'UPDATE random_apis SET image_count = ?, last_synced = datetime("now") WHERE id = ?',
                [total, api.id]
              );
              
              console.log(`✓ 更新API ${api.id}: ${total} 张图片`);
              
              // 延迟一下，避免请求过快
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              console.error(`✗ 更新API ${api.id} 失败:`, error.message);
            }
          }
        } catch (error) {
          console.error(`更新用户 ${user.id} 的API失败:`, error.message);
        }
      }
      
      console.log(`[${new Date().toLocaleString()}] 批量更新完成`);
    }
  );
}

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
    image_count INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT 1,
    use_count INTEGER DEFAULT 0,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
  
  // 添加image_count字段（如果不存在）
  db.run(`ALTER TABLE random_apis ADD COLUMN image_count INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('image_count字段已存在或添加失败:', err.message);
    }
  });
  
  // 添加last_synced字段（记录最后同步时间）
  db.run(`ALTER TABLE random_apis ADD COLUMN last_synced DATETIME`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('last_synced字段已存在或添加失败:', err.message);
    }
  });

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

// 获取正确的协议（处理反向代理）
function getProtocol(req) {
  // 优先使用 X-Forwarded-Proto 头（Nginx反向代理会设置）
  const forwarded = req.get('X-Forwarded-Proto');
  if (forwarded) {
    return forwarded;
  }
  // 其次使用标准的协议
  return req.protocol;
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
  const { forceRefresh } = req.query; // 支持强制刷新
  
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
    
    // 始终获取每个相册的最新图片数量（不仅仅是forceRefresh时）
    for (const album of albums) {
      try {
        const imgResponse = await axios.get(`${user.lsky_host}/api/v1/images`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          params: {
            albumId: album.id,
            per_page: 1  // 只需要获取总数，不需要所有图片
          },
          proxy: false,
          maxRedirects: 5,
          timeout: 30000
        });
        
        // 更新相册的图片数量
        if (imgResponse.data?.data?.total !== undefined) {
          album.image_num = imgResponse.data.data.total;
        }
      } catch (error) {
        console.error(`获取相册 ${album.id} 图片数量失败:`, error.message);
      }
      
      // 同步相册到本地数据库（使用最新的图片数量）
      db.run(
        `INSERT OR REPLACE INTO albums (user_id, album_id, name, description, image_count) 
         VALUES (?, ?, ?, ?, ?)`,
        [user.id, album.id, album.name, album.intro || '', album.image_num || 0]
      );
    }
    
    // 如果强制刷新，还要更新所有相关的随机API的图片数据
    if (forceRefresh === 'true') {
      // 更新所有相关的随机API的图片数据
      db.all(
        'SELECT * FROM random_apis WHERE user_id = ?',
        [user.id],
        async (err, apis) => {
          if (!err && apis) {
            for (const api of apis) {
              try {
                const imgResponse = await axios.get(`${user.lsky_host}/api/v1/images`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                  },
                  params: {
                    albumId: api.album_id,
                    per_page: 100
                  },
                  proxy: false,
                  maxRedirects: 5,
                  timeout: 30000
                });
                
                const images = imgResponse.data.data.data || [];
                const imageUrls = images.map(img => img.links.url);
                
                if (imageUrls.length > 0) {
                  db.run(
                    'UPDATE random_apis SET images = ? WHERE id = ?',
                    [JSON.stringify(imageUrls), api.id]
                  );
                }
              } catch (error) {
                console.error(`更新API ${api.id} 的图片失败:`, error.message);
              }
            }
          }
        }
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

// 创建随机API - 需要认证（优化版：只获取图片数量）
app.post('/api/random-api/create', authMiddleware, apiLimiter, async (req, res) => {
  const { albumId, apiName } = req.body;
  const user = req.user;
  
  if (!albumId || !apiName) {
    return res.status(400).json({ error: '请提供相册ID和API名称' });
  }
  
  try {
    // 解密token
    const token = user.token_encrypted ? decrypt(user.token_encrypted) : user.token;
    
    // 只获取1张图片以获得总数
    const response = await axios.get(`${user.lsky_host}/api/v1/images`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      params: {
        albumId: albumId,
        per_page: 1  // 只获取1张图片
      },
      proxy: false,
      maxRedirects: 5,
      timeout: 10000
    });

    const total = response.data?.data?.total || 0;
    
    if (total === 0) {
      return res.status(400).json({ error: '相册中没有图片' });
    }

    const apiKey = generateApiKey();

    db.run(
      `INSERT INTO random_apis (user_id, album_id, api_key, api_name, image_count, images) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, albumId, apiKey, apiName, total, '[]'],  // 不再存储图片列表
      function(err) {
        if (err) {
          return res.status(500).json({ error: '创建API失败' });
        }
        
        const apiUrl = `${getProtocol(req)}://${req.get('host')}/api/random/${apiKey}`;
        
        res.json({
          success: true,
          api: {
            id: this.lastID,
            api_key: apiKey,
            api_name: apiName,
            api_url: apiUrl,
            image_count: total
          }
        });
      }
    );
  } catch (error) {
    console.error('创建API错误:', error.message);
    res.status(500).json({ error: '创建随机API失败' });
  }
});

// 获取用户的随机API列表 - 使用缓存优先策略
app.get('/api/random-api/list', authMiddleware, async (req, res) => {
  const user = req.user;
  
  db.all(
    'SELECT * FROM random_apis WHERE user_id = ? ORDER BY created_at DESC',
    [user.id],
    async (err, apis) => {
      if (err) {
        return res.status(500).json({ error: '获取API列表失败' });
      }

      const updatedApis = [];
      let needsUpdate = false;
      
      // 检查是否需要更新（没有last_synced或超过24小时）
      for (const api of apis) {
        if (!api.last_synced) {
          needsUpdate = true;
          break;
        }
        const lastSyncTime = new Date(api.last_synced).getTime();
        const now = new Date().getTime();
        const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);
        
        if (hoursSinceSync > 24) {
          needsUpdate = true;
          break;
        }
      }
      
      // 如果需要更新且有API，后台异步更新（不阻塞返回）
      if (needsUpdate && apis.length > 0) {
        // 异步更新，不等待
        setTimeout(async () => {
          try {
            const token = user.token_encrypted ? decrypt(user.token_encrypted) : user.token;
            
            for (const api of apis) {
              try {
                const response = await axios.get(`${user.lsky_host}/api/v1/images`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                  },
                  params: {
                    albumId: api.album_id,
                    per_page: 1
                  },
                  proxy: false,
                  maxRedirects: 5,
                  timeout: 5000
                });
                
                const total = response.data?.data?.total || 0;
                
                // 更新数据库
                db.run(
                  'UPDATE random_apis SET image_count = ?, last_synced = datetime("now") WHERE id = ?',
                  [total, api.id]
                );
                
                console.log(`后台更新API ${api.id} 图片数量: ${total}`);
              } catch (error) {
                console.error(`后台更新API ${api.id} 失败:`, error.message);
              }
            }
          } catch (error) {
            console.error('后台批量更新失败:', error.message);
          }
        }, 100);  // 延迟100ms执行，确保响应先返回
      }
      
      // 立即返回缓存数据
      for (const api of apis) {
        updatedApis.push({
          id: api.id,
          api_key: api.api_key,
          api_name: api.api_name || `相册${api.album_id}的API`,
          api_url: `${getProtocol(req)}://${req.get('host')}/api/random/${api.api_key}`,
          enabled: api.enabled,
          use_count: api.use_count || 0,
          last_used_at: api.last_used_at,
          created_at: api.created_at,
          album_id: api.album_id,
          image_count: api.image_count || 0,
          last_synced: api.last_synced
        });
      }

      res.json({ success: true, apis: updatedApis });
    }
  );
});

// 创建随机数生成器（使用更好的随机算法）
function getRandomImage(images, apiKey, ipAddress) {
  if (images.length === 0) return null;
  if (images.length === 1) return images[0];
  
  // 使用种子随机数（基于时间戳和IP）实现更均匀的分布
  const seed = Date.now() + (ipAddress ? ipAddress.split('.').reduce((a, b) => a + parseInt(b), 0) : 0);
  const random = (seed * 9301 + 49297) % 233280;
  const index = Math.floor((random / 233280) * images.length);
  
  return images[index];
}

// 随机图片API（公开访问，实时获取）
app.get('/api/random/:apiKey', async (req, res) => {
  const { apiKey } = req.params;
  const { mode } = req.query; // 支持不同的随机模式

  try {
    // 获取API信息和用户信息
    const apiInfo = await new Promise((resolve, reject) => {
      db.get(
        `SELECT r.*, u.lsky_host, u.token, u.token_encrypted 
         FROM random_apis r 
         JOIN users u ON r.user_id = u.id 
         WHERE r.api_key = ? AND r.enabled = 1`,
        [apiKey],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!apiInfo) {
      return res.status(404).json({ error: 'API不存在或已禁用' });
    }

    // 解密token
    const token = apiInfo.token_encrypted ? decrypt(apiInfo.token_encrypted) : apiInfo.token;
    
    // 实时从Lsky获取图片
    let selectedImage;
    
    if (mode === 'sequence') {
      // 顺序模式：先获取总数，然后按顺序访问
      const firstResponse = await axios.get(`${apiInfo.lsky_host}/api/v1/images`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: {
          albumId: apiInfo.album_id,
          per_page: 1,
          page: 1
        },
        proxy: false,
        maxRedirects: 5,
        timeout: 5000
      });
      
      const total = firstResponse.data?.data?.total || 0;
      const totalPages = firstResponse.data?.data?.last_page || 1;
      
      if (total === 0) {
        return res.status(404).json({ error: '相册中没有图片' });
      }
      
      // 计算顺序页码（循环）
      const page = ((apiInfo.use_count || 0) % totalPages) + 1;
      
      if (page === 1) {
        // 使用已获取的第一页数据
        const images = firstResponse.data?.data?.data || [];
        if (images.length > 0) {
          selectedImage = images[0].links.url;
        }
      } else {
        // 获取指定页
        const response = await axios.get(`${apiInfo.lsky_host}/api/v1/images`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          params: {
            albumId: apiInfo.album_id,
            per_page: 1,
            page: page
          },
          proxy: false,
          maxRedirects: 5,
          timeout: 5000
        });
        
        const images = response.data?.data?.data || [];
        if (images.length > 0) {
          selectedImage = images[0].links.url;
        }
      }
    } else {
      // 随机模式：先获取总数，然后随机选择
      const response = await axios.get(`${apiInfo.lsky_host}/api/v1/images`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: {
          albumId: apiInfo.album_id,
          per_page: 1,
          page: 1  // 先获取第一页，同时获得total
        },
        proxy: false,
        maxRedirects: 5,
        timeout: 5000
      });
      
      const total = response.data?.data?.total || 0;
      const totalPages = response.data?.data?.last_page || 1;
      
      if (total === 0) {
        return res.status(404).json({ error: '相册中没有图片' });
      }
      
      // 随机选择一个有效的页码（1到totalPages之间）
      const randomPage = Math.floor(Math.random() * totalPages) + 1;
      
      // 如果不是第一页，重新请求随机页
      if (randomPage !== 1) {
        const randomResponse = await axios.get(`${apiInfo.lsky_host}/api/v1/images`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          params: {
            albumId: apiInfo.album_id,
            per_page: 1,
            page: randomPage
          },
          proxy: false,
          maxRedirects: 5,
          timeout: 5000
        });
        
        const randomImages = randomResponse.data?.data?.data || [];
        if (randomImages.length > 0) {
          selectedImage = randomImages[0].links.url;
        }
      } else {
        // 使用第一页的结果
        const images = response.data?.data?.data || [];
        if (images.length > 0) {
          selectedImage = images[0].links.url;
        }
      }
    }
    
    if (!selectedImage) {
      return res.status(404).json({ error: '没有可用的图片' });
    }
    
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
      [apiInfo.id, ipAddress, userAgent, referer],
      (err) => {
        if (err) console.error('记录访问日志失败:', err);
      }
    );
    
    // 返回图片URL（重定向）
    res.redirect(selectedImage);
    
  } catch (error) {
    console.error('获取随机图片失败:', error.message);
    res.status(500).json({ error: '获取图片失败，请稍后重试' });
  }
});

// 手动刷新API列表数据
app.post('/api/random-api/refresh', authMiddleware, async (req, res) => {
  const user = req.user;
  
  try {
    // 获取用户的所有API
    const apis = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM random_apis WHERE user_id = ?',
        [user.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    if (apis.length === 0) {
      return res.json({ success: true, message: '没有需要更新的API' });
    }
    
    const token = user.token_encrypted ? decrypt(user.token_encrypted) : user.token;
    let successCount = 0;
    let failCount = 0;
    
    // 并行更新所有API的数据
    const updatePromises = apis.map(api => {
      return axios.get(`${user.lsky_host}/api/v1/images`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: {
          albumId: api.album_id,
          per_page: 1
        },
        proxy: false,
        maxRedirects: 5,
        timeout: 5000
      }).then(response => {
        const total = response.data?.data?.total || 0;
        
        // 更新数据库
        db.run(
          'UPDATE random_apis SET image_count = ?, last_synced = datetime("now") WHERE id = ?',
          [total, api.id],
          (err) => {
            if (err) {
              console.error(`更新API ${api.id} 数据库失败:`, err);
            }
          }
        );
        
        successCount++;
        return { success: true, apiId: api.id, count: total };
      }).catch(error => {
        console.error(`刷新API ${api.id} 失败:`, error.message);
        failCount++;
        return { success: false, apiId: api.id, error: error.message };
      });
    });
    
    const results = await Promise.all(updatePromises);
    
    res.json({
      success: true,
      message: `更新完成: ${successCount} 成功, ${failCount} 失败`,
      details: results
    });
    
  } catch (error) {
    console.error('刷新API数据失败:', error);
    res.status(500).json({ error: '刷新失败' });
  }
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
║  ✅ 智能缓存策略                                       ║
║  ✅ 定时自动更新                                       ║
╚════════════════════════════════════════════════════════╝
  `);
  
  // 启动定时任务
  scheduleDailyUpdate();
  
  // 检查是否有.env文件
  if (!require('fs').existsSync('.env')) {
    console.log(`
⚠️  警告: 未找到 .env 配置文件
请复制 .env.example 并重命名为 .env，然后修改其中的配置
    `);
  }
});