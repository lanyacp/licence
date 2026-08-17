const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// 模板上传时用 PIL 转图，必须使用带有 PIL 的 Python 解释器
const PYTHON_BIN = 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python314\\python.exe';

// 删除临时文件：某些环境下 unlink 可能被拦截或失败，忽略即可，不影响主流程
function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* ignore */ }
}

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// 确保目录存在
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const TEMPLATE_FILE = path.join(DATA_DIR, 'template.jpg');

function defaultConfig() {
  return {
    adminPassword: 'admin123',
    templateUploaded: false,
    orgName: '扶沟县教师进修学校',
    certificatePrefix: 'NLTS4124XP',
    projects: [
      { number: '01', name: '中小学教师师德师风建设专项培训（第一期）', startDate: '2025-07-07', endDate: '2025-07-07', hours: 8 },
      { number: '02', name: '中小学教师师德师风建设专项培训（第二期）', startDate: '2025-07-08', endDate: '2025-07-09', hours: 16 },
      { number: '03', name: '新入职教师能力提升培训', startDate: '2025-07-10', endDate: '2025-07-13', hours: 32 },
      { number: '04', name: '核心能力导向的小学班主任培训', startDate: '2025-07-15', endDate: '2025-07-16', hours: 16 },
      { number: '05', name: '核心能力导向的中学班主任培训', startDate: '2025-07-17', endDate: '2025-07-18', hours: 16 },
      { number: '06', name: '初中数学聚焦核心素养赋能学科课堂', startDate: '2025-07-19', endDate: '2025-07-20', hours: 16 },
      { number: '07', name: '初中语文聚焦核心素养赋能学科课堂', startDate: '2025-07-21', endDate: '2025-07-22', hours: 16 },
      { number: '08', name: '初中英语聚焦核心素养赋能学科课堂', startDate: '2025-07-23', endDate: '2025-07-24', hours: 16 }
    ],
    fields: [
      { key: 'certificateNumber', label: '证书编号', x: 0.72, y: 0.215, fontSize: 24, color: '#000000', fontFamily: 'STXingkai, KaiTi, SimSun, serif', align: 'left', fontWeight: 'normal', lineHeight: 1.5 },
      { key: 'bodyText', label: '证书正文', x: 0.115, y: 0.375, fontSize: 42, color: '#000000', fontFamily: 'STXingkai, KaiTi, SimSun, serif', align: 'left', fontWeight: 'normal', lineHeight: 1.9, maxWidth: 0.79, firstLineIndent: 2 },
      { key: 'orgName', label: '发证单位', x: 0.78, y: 0.78, fontSize: 28, color: '#000000', fontFamily: 'STXingkai, KaiTi, SimSun, serif', align: 'right', fontWeight: 'normal', lineHeight: 1.5 },
      { key: 'issueDate', label: '发证日期', x: 0.78, y: 0.835, fontSize: 28, color: '#000000', fontFamily: 'STXingkai, KaiTi, SimSun, serif', align: 'right', fontWeight: 'normal', lineHeight: 1.5 }
    ]
  };
}

// 项目配置辅助函数
function getProjectConfig(config, projectName) {
  const projects = config.projects || [];
  if (!projectName) return null;
  const name = String(projectName).trim();
  // 先按名称完全匹配或包含匹配
  let p = projects.find(p => p.name === name);
  if (!p) p = projects.find(p => name.includes(p.name) || p.name.includes(name));
  // 再尝试按项目编号匹配
  if (!p) {
    const m = name.match(/0?([1-8])/);
    if (m) p = projects.find(p => p.number === m[1].padStart(2, '0'));
  }
  return p || null;
}

function formatChineseDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function computeCertificateData(students, config) {
  const prefix = config.certificatePrefix || 'NLTS4124XP';
  const projects = config.projects || [];
  const seqMap = {};
  projects.forEach(p => seqMap[p.number] = 0);

  return students.map(s => {
    const p = getProjectConfig(config, s.project) || { number: '02', startDate: '2025-07-08', endDate: '2025-07-09', hours: 16 };
    seqMap[p.number] = (seqMap[p.number] || 0) + 1;
    const seq = String(seqMap[p.number]).padStart(3, '0');
    const certificateNumber = `${prefix}${p.number}${seq}`;
    const startDate = formatChineseDate(p.startDate);
    const endDate = formatChineseDate(p.endDate);
    const issueDate = endDate;
    const bodyText = `${s.name} 同志于 ${startDate} 至 ${endDate} 在${config.orgName || '扶沟县教师进修学校'}参加${s.project || p.name}，共 ${p.hours} 学时，成绩合格。`;
    return {
      ...s,
      projectNumber: p.number,
      certificateNumber,
      hours: String(p.hours),
      startDate,
      endDate,
      issueDate,
      bodyText
    };
  });
}

// 初始化数据文件
if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, JSON.stringify({ students: [] }, null, 2));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig(), null, 2));

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 80 * 1024 * 1024 } });

// 管理端认证中间件
function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (password !== config.adminPassword) {
    return res.status(401).json({ error: '未授权，请输入正确的管理密码' });
  }
  next();
}

// ====== 管理端 API ======

// 登录验证
app.post('/api/admin/login', (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (req.body.password === config.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// 修改管理密码
app.post('/api/admin/password', adminAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  config.adminPassword = req.body.password;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

// 修改机构名称
app.post('/api/admin/orgname', adminAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  config.orgName = req.body.orgName || '扶沟县教师进修学校';
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

// 修改证书编号前缀
app.post('/api/admin/certificate-prefix', adminAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  config.certificatePrefix = req.body.prefix || 'NLTS4124XP';
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

// 获取项目配置
app.get('/api/admin/projects', adminAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  res.json({ projects: config.projects || [] });
});

// 保存项目配置
app.post('/api/admin/projects', adminAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (Array.isArray(req.body.projects)) {
    config.projects = req.body.projects.map(p => ({
      number: String(p.number || '').padStart(2, '0'),
      name: String(p.name || '').trim(),
      startDate: String(p.startDate || '').trim(),
      endDate: String(p.endDate || '').trim(),
      hours: parseInt(p.hours, 10) || 16
    }));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
  res.json({ success: true, projects: config.projects });
});

// 重新计算所有学员的证书编号和学时
app.post('/api/admin/recompute', adminAuth, (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const data = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
    const students = computeCertificateData(data.students || [], config);
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify({ students }, null, 2));
    res.json({ success: true, count: students.length });
  } catch (err) {
    res.status(500).json({ error: '重新计算失败: ' + err.message });
  }
});

// 上传Excel
app.post('/api/admin/upload-excel', adminAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 以数组形式读取，自动识别真正的表头行（兼容第一行为大标题的情况）
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rawRows.length === 0) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: 'Excel文件中没有数据' });
    }

    const headerAliases = {
      name: ['姓名', 'name'],
      gender: ['性别', 'gender', 'sex'],
      idNumber: ['身份证号', '身份证', 'idnumber', 'id_card', '身份证号码', '身份征号', '身份征'],
      township: ['乡镇', '所属乡镇', 'township', '乡', '镇', '所在地'],
      school: ['学校', 'school', '单位', '工作单位', '任职学校'],
      project: ['项目', '培训项目', 'project', '培训名称', '课程'],
      hours: ['学时', 'hours', '课时', '学时数'],
      phone: ['联系电话', '手机', '电话', '手机号', '联系方式', 'phone', 'mobile']
    };

    const normalize = (v) => String(v || '').toLowerCase().replace(/[\s\u3000]+/g, '').trim();

    // 为每一行打分：包含多少个已知列别名
    function scoreHeaderRow(row) {
      const normalized = row.map(normalize);
      let score = 0;
      const mapping = {};
      for (const [field, aliases] of Object.entries(headerAliases)) {
        for (const alias of aliases) {
          const idx = normalized.findIndex(h => h === alias || h.includes(alias));
          if (idx !== -1) {
            score++;
            mapping[field] = idx;
            break;
          }
        }
      }
      return { score, mapping, raw: row };
    }

    let best = { score: 0, headerRowIndex: -1, mapping: {}, raw: [] };
    const searchLimit = Math.min(15, rawRows.length);
    for (let i = 0; i < searchLimit; i++) {
      const result = scoreHeaderRow(rawRows[i]);
      if (result.score > best.score) {
        best = { ...result, headerRowIndex: i };
      }
    }

    // 调试信息：前5行原始内容
    const debugRows = rawRows.slice(0, 5).map((r, i) => ({
      rowIndex: i + 1,
      cells: r.map(c => String(c || '').trim()).filter(c => c).slice(0, 8)
    }));

    // 必须识别到 姓名 + 身份证号 才能继续
    if (best.score < 2 || best.mapping.name === undefined || best.mapping.idNumber === undefined) {
      safeUnlink(req.file.path);
      return res.status(400).json({
        error: '未识别到有效的表头行，请确保Excel中包含“姓名”和“身份证号”列。',
        detectedHeaders: best.raw.map(c => String(c || '').trim()).filter(c => c),
        headerRowIndex: best.headerRowIndex === -1 ? null : best.headerRowIndex + 1,
        firstRows: debugRows,
        suggestion: '如果第一行是大标题（如“培训名单”），请在Excel中删除标题行，或把列头放到第一行。'
      });
    }

    // 解析数据行
    let students = [];
    for (let i = best.headerRowIndex + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const s = { id: students.length + 1 };
      for (const [field, idx] of Object.entries(best.mapping)) {
        s[field] = String(row[idx] || '').trim();
      }
      if (!s.name || s.name === '姓名') continue;
      students.push(s);
    }

    if (students.length === 0) {
      safeUnlink(req.file.path);
      return res.status(400).json({
        error: '已识别表头，但未解析到有效学员数据，请检查表头下方是否有数据行。',
        detectedHeaders: best.raw.map(c => String(c || '').trim()).filter(c => c),
        headerRowIndex: best.headerRowIndex + 1,
        firstRows: debugRows
      });
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    students = computeCertificateData(students, config);

    fs.writeFileSync(STUDENTS_FILE, JSON.stringify({ students }, null, 2));
    safeUnlink(req.file.path);

    res.json({ success: true, count: students.length, sample: students.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: '解析Excel失败: ' + err.message });
  }
});

// 上传模板图片
app.post('/api/admin/upload-template', adminAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: '请上传JPG或PNG格式的图片' });
    }

    // 统一转为 JPEG 并限制最大宽度 4200，保证格式一致且前端加载快
    const pyScript = "from PIL import Image; import sys; src=sys.argv[1]; dst=sys.argv[2]; im=Image.open(src).convert('RGB'); w,h=im.size; im=im.resize((4200,int(h*4200/w)),Image.LANCZOS) if w>4200 else im; im.save(dst,'JPEG',quality=92)";
    execFileSync(PYTHON_BIN, ['-c', pyScript, req.file.path, TEMPLATE_FILE], { timeout: 120000 });
    safeUnlink(req.file.path);

    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    config.templateUploaded = true;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    res.json({ success: true });
  } catch (err) {
    safeUnlink(req.file && req.file.path);
    res.status(500).json({ error: '上传模板失败: ' + err.message });
  }
});

// 获取配置
app.get('/api/admin/config', adminAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  res.json(config);
});

// 保存字段配置
app.post('/api/admin/config', adminAuth, (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  config.fields = req.body.fields;
  if (req.body.orgName) config.orgName = req.body.orgName;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ success: true });
});

// 获取学员列表
app.get('/api/admin/students', adminAuth, (req, res) => {
  const data = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
  res.json(data);
});

// 清空学员
app.delete('/api/admin/students', adminAuth, (req, res) => {
  fs.writeFileSync(STUDENTS_FILE, JSON.stringify({ students: [] }, null, 2));
  res.json({ success: true });
});

// 统计信息
app.get('/api/admin/stats', adminAuth, (req, res) => {
  const data = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  res.json({
    studentCount: data.students.length,
    templateUploaded: config.templateUploaded,
    fieldCount: config.fields.length
  });
});

// ====== 学员端 API ======

// 学员验证
app.post('/api/verify', (req, res) => {
  const { name, idNumber } = req.body;
  if (!name || !idNumber) {
    return res.status(400).json({ error: '请输入姓名和身份证号' });
  }

  const data = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const cleanName = name.trim();
  const cleanId = idNumber.trim().replace(/\s/g, '');

  let student = data.students.find(s =>
    s.name === cleanName && s.idNumber.replace(/\s/g, '') === cleanId
  );

  if (!student) {
    return res.status(404).json({ error: '未找到匹配的学员信息，请检查姓名和身份证号是否正确' });
  }

  // 如果没有计算字段（旧数据），则实时计算
  if (!student.certificateNumber) {
    const computed = computeCertificateData([student], config)[0];
    student = { ...student, ...computed };
  }

  res.json({ success: true, student });
});

// 获取模板图片（学员端无需认证）
app.get('/api/template', (req, res) => {
  if (fs.existsSync(TEMPLATE_FILE)) {
    res.sendFile(TEMPLATE_FILE);
  } else {
    res.status(404).json({ error: '模板未上传' });
  }
});

// 获取字段配置（学员端无需认证）
app.get('/api/config', (req, res) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  res.json({
    fields: config.fields,
    templateUploaded: config.templateUploaded,
    orgName: config.orgName,
    certificatePrefix: config.certificatePrefix || 'NLTS4124XP',
    projects: config.projects || []
  });
});

// ===== 导出静态网站（用于公网部署）=====
app.post('/api/admin/build-static', adminAuth, (req, res) => {
  const BUILD_DIR = path.join(__dirname, 'dist');
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const studentsData = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

  if (!config.templateUploaded) {
    return res.status(400).json({ error: '请先上传证书模板' });
  }
  if (!studentsData.students.length) {
    return res.status(400).json({ error: '请先上传学员数据' });
  }

  // 生成 data.js（学员数据 + 配置）
  const dataJs = 'window.__STUDENTS__=' + JSON.stringify(studentsData.students) +
    ';\nwindow.__CONFIG__=' + JSON.stringify({
      fields: config.fields,
      orgName: config.orgName,
      certificatePrefix: config.certificatePrefix || 'NLTS4124XP',
      projects: config.projects || []
    }) + ';';
  fs.writeFileSync(path.join(BUILD_DIR, 'data.js'), dataJs, 'utf8');

  // 复制模板图片
  fs.copyFileSync(TEMPLATE_FILE, path.join(BUILD_DIR, 'template.jpg'));

  // 生成自包含的 index.html
  const html = generateStaticHTML(config.orgName);
  fs.writeFileSync(path.join(BUILD_DIR, 'index.html'), html, 'utf8');

  res.json({ success: true, studentCount: studentsData.students.length });
});

function generateStaticHTML(orgName) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>培训结业证书下载</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;color:#333}
.student-container{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.student-card{background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);padding:48px 40px;width:100%;max-width:480px}
.logo{text-align:center;margin-bottom:24px}
.logo-icon{width:64px;height:64px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px;color:#fff}
h1{text-align:center;font-size:26px;color:#1a1a2e;margin-bottom:8px}
.subtitle{text-align:center;color:#888;font-size:14px;margin-bottom:32px}
.form-group{margin-bottom:20px}
.form-group label{display:block;font-size:14px;color:#555;margin-bottom:8px;font-weight:500}
.form-group input{width:100%;padding:12px 16px;border:2px solid #e0e0e0;border-radius:8px;font-size:16px;outline:none}
.form-group input:focus{border-color:#667eea}
.btn-primary{width:100%;padding:14px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}
.btn-primary:hover{opacity:.92}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-secondary{padding:12px 24px;background:#f0f0f0;color:#555;border:none;border-radius:8px;font-size:15px;cursor:pointer}
.message{margin-top:16px;padding:12px 16px;border-radius:8px;font-size:14px;display:none}
.message.error{background:#fee;color:#c33;display:block}
.result-container{min-height:100vh;padding:30px 20px}
.result-card{background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);padding:32px;max-width:1000px;margin:0 auto}
.result-card h2{text-align:center;margin-bottom:8px;color:#1a1a2e}
.hint{text-align:center;color:#888;font-size:14px;margin-bottom:24px}
.certificate-preview{text-align:center;margin-bottom:24px;overflow:auto}
.certificate-preview canvas{max-width:100%;height:auto;border:1px solid #eee;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-download{padding:14px 32px;background:linear-gradient(135deg,#11998e,#38ef7d);color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}
@media(max-width:768px){.student-card{padding:32px 24px}}
</style>
</head>
<body>
<div class="student-container" id="verifySection">
  <div class="student-card">
    <div class="logo"><div class="logo-icon">&#127891;</div></div>
    <h1>培训结业证书下载</h1>
    <p class="subtitle">请输入您的个人信息进行验证</p>
    <form id="verifyForm">
      <div class="form-group"><label>姓名</label><input type="text" id="name" placeholder="请输入您的姓名" autocomplete="off" required></div>
      <div class="form-group"><label>身份证号</label><input type="text" id="idNumber" placeholder="请输入您的身份证号" autocomplete="off" required></div>
      <button type="submit" class="btn-primary" id="submitBtn">查询并生成证书</button>
    </form>
    <div class="message" id="message"></div>
  </div>
</div>
<div class="result-container" id="resultSection" style="display:none">
  <div class="result-card">
    <h2>您的结业证书已生成</h2>
    <p class="hint">请确认信息无误后下载，证书保存为高清图片</p>
    <div class="certificate-preview"><canvas id="certificateCanvas"></canvas></div>
    <div class="actions">
      <button class="btn-download" id="downloadBtn">&#11015; 下载证书</button>
      <button class="btn-secondary" id="backBtn">重新查询</button>
    </div>
  </div>
</div>
<script src="data.js"></script>
<script>
var currentStudent=null, certCanvas=null;
function loadImage(url){return new Promise(function(resolve,reject){var img=new Image();img.crossOrigin='anonymous';img.onload=function(){resolve(img)};img.onerror=function(){reject(new Error('load fail'))};img.src=url})}
function showMessage(text,type){var el=document.getElementById('message');el.textContent=text;el.className='message '+type}
function getFieldValue(field,student,config){
  if(field.key==='orgName')return config.orgName||'';
  if(field.key==='issueDate')return student.issueDate||'';
  if(field.key==='certificateNumber')return '编号：'+(student.certificateNumber||'');
  return student[field.key]||'';
}
function wrapText(ctx,text,maxWidth){
  var chars=text.split(''),lines=[],current='';
  for(var i=0;i<chars.length;i++){
    var test=current+chars[i];
    if(ctx.measureText(test).width>maxWidth&&current){lines.push(current);current=chars[i];}else{current=test;}
  }
  if(current)lines.push(current);
  return lines.length?lines:[text];
}
function drawWrappedText(ctx,text,x,y,field,w){
  var maxWidth=(field.maxWidth||0.8)*w;
  var firstIndent=(field.firstLineIndent||0)*field.fontSize;
  var lines=wrapText(ctx,text,maxWidth-firstIndent);
  var lh=field.fontSize*(field.lineHeight||1.5);
  var align=field.align||'left';
  lines.forEach(function(line,idx){
    var lx=x+(idx===0?firstIndent:0);
    var textWidth=ctx.measureText(line).width;
    var drawX=lx;
    if(align==='center')drawX=lx+maxWidth/2-textWidth/2;
    else if(align==='right')drawX=lx+maxWidth-textWidth;
    ctx.fillText(line,drawX,y+idx*lh);
  });
}
function drawField(ctx,field,student,config,w,h){
  var value=getFieldValue(field,student,config);
  if(!value)return;
  var x=field.x*w, y=field.y*h;
  var fp=[];
  if(field.fontWeight==='bold')fp.push('bold');
  fp.push(field.fontSize+'px');
  fp.push(field.fontFamily||'SimSun');
  ctx.font=fp.join(' ');
  ctx.fillStyle=field.color||'#333';
  ctx.textAlign='left';
  ctx.textBaseline='top';
  if(field.maxWidth){
    drawWrappedText(ctx,value,x,y,field,w);
  }else{
    if(field.align==='center'){ctx.textAlign='center';ctx.fillText(value,x,y);}
    else if(field.align==='right'){ctx.textAlign='right';ctx.fillText(value,x,y);}
    else{ctx.fillText(value,x,y);}
  }
}
document.getElementById('verifyForm').addEventListener('submit',function(e){
  e.preventDefault();
  var name=document.getElementById('name').value.trim();
  var idNumber=document.getElementById('idNumber').value.trim().replace(/\\s/g,'');
  var btn=document.getElementById('submitBtn');
  if(!name||!idNumber){showMessage('请输入姓名和身份证号','error');return}
  btn.disabled=true;btn.textContent='查询中...';
  document.getElementById('message').className='message';
  var student=(window.__STUDENTS__||[]).find(function(s){return s.name===name&&s.idNumber.replace(/\\s/g,'')===idNumber});
  if(!student){showMessage('未找到匹配的学员信息，请检查姓名和身份证号是否正确','error');btn.disabled=false;btn.textContent='查询并生成证书';return}
  currentStudent=student;
  showCertificate();
});
function showCertificate(){
  var config=window.__CONFIG__||{};
  loadImage('template.jpg').then(function(img){
    certCanvas=document.getElementById('certificateCanvas');
    var ctx=certCanvas.getContext('2d');
    certCanvas.width=img.naturalWidth;certCanvas.height=img.naturalHeight;
    ctx.drawImage(img,0,0,certCanvas.width,certCanvas.height);
    (config.fields||[]).forEach(function(field){drawField(ctx,field,currentStudent,config,certCanvas.width,certCanvas.height);});
    document.getElementById('verifySection').style.display='none';
    document.getElementById('resultSection').style.display='block';
    document.getElementById('submitBtn').disabled=false;
    document.getElementById('submitBtn').textContent='查询并生成证书';
    window.scrollTo(0,0);
  }).catch(function(){showMessage('模板加载失败','error')});
}
document.getElementById('downloadBtn').addEventListener('click',function(){
  if(!certCanvas)return;
  var link=document.createElement('a');
  link.download=currentStudent.name+'-结业证书.jpg';
  link.href=certCanvas.toDataURL('image/jpeg',0.95);
  link.click();
});
document.getElementById('backBtn').addEventListener('click',function(){
  document.getElementById('resultSection').style.display='none';
  document.getElementById('verifySection').style.display='flex';
  document.getElementById('name').value='';document.getElementById('idNumber').value='';
  document.getElementById('message').className='message';currentStudent=null;
});
</script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  培训学时证书生成系统已启动');
  console.log('========================================');
  console.log('  学员端: http://localhost:' + PORT);
  console.log('  管理端: http://localhost:' + PORT + '/admin.html');
  console.log('  默认管理密码: admin123');
  console.log('========================================');
});
