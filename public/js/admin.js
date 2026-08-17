// ===== 管理端逻辑 =====

let adminPassword = '';
let editorConfig = null;
let editorTemplateImg = null;
let editorCanvas = null;
let editorCtx = null;
let selectedFieldIndex = -1;
let isDragging = false;
let allStudents = [];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fieldSamples = {
  name: '张三',
  gender: '男',
  idNumber: '420101199001011234',
  township: '城关镇',
  school: '第一小学',
  project: '中小学教师师德师风建设专项培训（第一期）',
  hours: '16',
  date: formatDate(new Date()),
  orgName: '扶沟县教师进修学校',
  certificateNumber: '编号：NLTS4124XP01001',
  bodyText: '张三 同志于 2025年07月07日 至 2025年07月07日 在扶沟县教师进修学校参加中小学教师师德师风建设专项培训（第一期），共 8 学时，成绩合格。',
  issueDate: '2025年07月07日'
};

// 带认证的fetch
async function adminFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['x-admin-password'] = adminPassword;
  const resp = await fetch(url, options);
  return resp;
}

// ===== 登录 =====
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('loginPassword').value;
  const resp = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  });
  const data = await resp.json();
  if (resp.ok && data.success) {
    adminPassword = pwd;
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminMain').style.display = 'block';
    initAdmin();
  } else {
    const msg = document.getElementById('loginMsg');
    msg.textContent = data.error || '登录失败';
    msg.className = 'message error';
  }
});

// ===== 导航切换 =====
document.querySelectorAll('.admin-header .nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-header .nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('panel-' + btn.dataset.panel);
    panel.classList.add('active');
    if (btn.dataset.panel === 'dashboard') loadStats();
    if (btn.dataset.panel === 'data') loadStudents();
    if (btn.dataset.panel === 'projects') loadProjectsEditor();
    if (btn.dataset.panel === 'template') loadTemplateEditor();
    if (btn.dataset.panel === 'export') loadExportPanel();
    if (btn.dataset.panel === 'settings') loadSettings();
  });
});

// ===== 初始化 =====
async function initAdmin() {
  loadStats();
  document.getElementById('studentLink').href = window.location.origin + '/';
}

// ===== 仪表盘 =====
async function loadStats() {
  const resp = await adminFetch('/api/admin/stats');
  const data = await resp.json();
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${data.studentCount}</div>
      <div class="stat-label">已导入学员数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${data.templateUploaded ? '&#10004;' : '&#10006;'}</div>
      <div class="stat-label">证书模板</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${data.fieldCount}</div>
      <div class="stat-label">已配置字段数</div>
    </div>
  `;
}

// ===== Excel 上传 =====
const excelUploadArea = document.getElementById('excelUploadArea');
const excelInput = document.getElementById('excelInput');

excelUploadArea.addEventListener('click', () => excelInput.click());
excelUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); excelUploadArea.style.borderColor = '#667eea'; });
excelUploadArea.addEventListener('dragleave', () => { excelUploadArea.style.borderColor = '#d0d0d0'; });
excelUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  excelUploadArea.style.borderColor = '#d0d0d0';
  if (e.dataTransfer.files.length) handleExcelUpload(e.dataTransfer.files[0]);
});
excelInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleExcelUpload(e.target.files[0]);
});

async function handleExcelUpload(file) {
  const resultEl = document.getElementById('excelResult');
  resultEl.innerHTML = '<div class="alert alert-warning">正在上传并解析...</div>';
  const formData = new FormData();
  formData.append('file', file);
  const resp = await adminFetch('/api/admin/upload-excel', { method: 'POST', body: formData });
  const data = await resp.json();
  if (resp.ok && data.success) {
    resultEl.innerHTML = `
      <div class="alert alert-success">上传成功！共导入 <strong>${data.count}</strong> 条学员记录</div>
      ${data.sample && data.sample.length ? `
        <p style="margin-top:12px;font-size:14px;color:#666;">前几条数据预览：</p>
        <div class="table-wrap" style="margin-top:8px;max-height:200px;">
          <table class="data-table">
            <thead><tr><th>姓名</th><th>性别</th><th>身份证号</th><th>乡镇</th><th>学校</th><th>项目</th><th>学时</th><th>证书编号</th></tr></thead>
            <tbody>
              ${data.sample.map(s => `<tr><td>${s.name}</td><td>${s.gender || '-'}</td><td>${s.idNumber}</td><td>${s.township || '-'}</td><td>${s.school || '-'}</td><td>${s.project || '-'}</td><td>${s.hours || '-'}</td><td>${s.certificateNumber || '-'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
    loadStats();
    loadStudents();
  } else {
    resultEl.innerHTML = `<div class="alert alert-error">${data.error || '上传失败'}</div>`;
  }
}

// ===== 学员列表 =====
async function loadStudents() {
  const resp = await adminFetch('/api/admin/students');
  const data = await resp.json();
  allStudents = data.students || [];
  renderStudentTable(allStudents);
}

function renderStudentTable(students) {
  const tbody = document.getElementById('studentTbody');
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:30px;">暂无数据，请先上传 Excel</td></tr>';
    return;
  }
  tbody.innerHTML = students.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${s.name}</td>
      <td>${s.gender || '-'}</td>
      <td>${s.idNumber}</td>
      <td>${s.township || '-'}</td>
      <td>${s.school || '-'}</td>
      <td>${s.project || '-'}</td>
      <td>${s.hours || '-'}</td>
      <td>${s.certificateNumber || '-'}</td>
    </tr>
  `).join('');
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  const kw = e.target.value.trim().toLowerCase();
  if (!kw) { renderStudentTable(allStudents); return; }
  const filtered = allStudents.filter(s =>
    s.name.toLowerCase().includes(kw) || (s.school || '').toLowerCase().includes(kw)
  );
  renderStudentTable(filtered);
});

document.getElementById('clearStudentsBtn').addEventListener('click', async () => {
  if (!confirm('确定要清空所有学员数据吗？此操作不可恢复。')) return;
  const resp = await adminFetch('/api/admin/students', { method: 'DELETE' });
  if (resp.ok) {
    loadStudents();
    loadStats();
    alert('已清空');
  }
});

// ===== 项目配置 =====
async function loadProjectsEditor() {
  const resp = await adminFetch('/api/admin/projects');
  const data = await resp.json();
  const projects = data.projects || [];
  const container = document.getElementById('projectsEditor');
  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>项目编号</th><th>培训项目名称</th><th>开始日期</th><th>结束日期</th><th>学时</th></tr>
        </thead>
        <tbody>
          ${projects.map((p, i) => `
            <tr data-index="${i}">
              <td><input type="text" class="proj-number" value="${p.number}" style="width:60px;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
              <td><input type="text" class="proj-name" value="${p.name}" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
              <td><input type="date" class="proj-start" value="${p.startDate}" style="padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
              <td><input type="date" class="proj-end" value="${p.endDate}" style="padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
              <td><input type="number" class="proj-hours" value="${p.hours}" min="0" style="width:70px;padding:6px;border:1px solid #ddd;border-radius:4px;"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

document.getElementById('saveProjectsBtn').addEventListener('click', async () => {
  const rows = document.querySelectorAll('#projectsEditor tbody tr');
  const projects = Array.from(rows).map(row => ({
    number: row.querySelector('.proj-number').value.trim(),
    name: row.querySelector('.proj-name').value.trim(),
    startDate: row.querySelector('.proj-start').value,
    endDate: row.querySelector('.proj-end').value,
    hours: parseInt(row.querySelector('.proj-hours').value, 10) || 0
  }));
  const msgEl = document.getElementById('projectsSaveMsg');
  msgEl.textContent = '保存中...';
  msgEl.style.color = '#999';
  const resp = await adminFetch('/api/admin/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects })
  });
  if (resp.ok) {
    msgEl.textContent = '项目配置已保存';
    msgEl.style.color = '#389e0d';
  } else {
    msgEl.textContent = '保存失败';
    msgEl.style.color = '#cf1322';
  }
});

document.getElementById('recomputeBtn').addEventListener('click', async () => {
  if (!confirm('确定要重新计算所有学员的证书编号和学时吗？')) return;
  const msgEl = document.getElementById('projectsSaveMsg');
  msgEl.textContent = '正在重新计算...';
  const resp = await adminFetch('/api/admin/recompute', { method: 'POST' });
  const data = await resp.json();
  if (resp.ok && data.success) {
    msgEl.textContent = `已重新计算 ${data.count} 名学员的证书编号和学时`;
    msgEl.style.color = '#389e0d';
    loadStudents();
  } else {
    msgEl.textContent = data.error || '重新计算失败';
    msgEl.style.color = '#cf1322';
  }
});

// ===== 模板上传 =====
const templateUploadArea = document.getElementById('templateUploadArea');
const templateInput = document.getElementById('templateInput');

templateUploadArea.addEventListener('click', () => templateInput.click());
templateUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); templateUploadArea.style.borderColor = '#667eea'; });
templateUploadArea.addEventListener('dragleave', () => { templateUploadArea.style.borderColor = '#d0d0d0'; });
templateUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  templateUploadArea.style.borderColor = '#d0d0d0';
  if (e.dataTransfer.files.length) handleTemplateUpload(e.dataTransfer.files[0]);
});
templateInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleTemplateUpload(e.target.files[0]);
});

async function handleTemplateUpload(file) {
  const resultEl = document.getElementById('templateResult');
  resultEl.innerHTML = '<div class="alert alert-warning">正在上传...</div>';
  const formData = new FormData();
  formData.append('file', file);
  const resp = await adminFetch('/api/admin/upload-template', { method: 'POST', body: formData });
  const data = await resp.json();
  if (resp.ok && data.success) {
    resultEl.innerHTML = '<div class="alert alert-success">模板上传成功！请在下方配置文字位置</div>';
    loadTemplateEditor();
    loadStats();
  } else {
    resultEl.innerHTML = `<div class="alert alert-error">${data.error || '上传失败'}</div>`;
  }
}

// ===== 生成示例模板 =====
document.getElementById('generateTemplateBtn').addEventListener('click', async () => {
  const btn = document.getElementById('generateTemplateBtn');
  btn.disabled = true;
  btn.textContent = '正在生成...';

  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1131;
  const ctx = canvas.getContext('2d');

  // 白色背景
  ctx.fillStyle = '#fffbf0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 外边框（金色双线）
  ctx.strokeStyle = '#c9a96e';
  ctx.lineWidth = 8;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

  // 标题
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 80px SimHei';
  ctx.textAlign = 'center';
  ctx.fillText('学 时 证 书', canvas.width / 2, 200);

  // 装饰线
  ctx.strokeStyle = '#c9a96e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 250, 250);
  ctx.lineTo(canvas.width / 2 + 250, 250);
  ctx.stroke();

  // 副标题
  ctx.fillStyle = '#b8941e';
  ctx.font = '28px SimSun';
  ctx.fillText('CERTIFICATE OF TRAINING HOURS', canvas.width / 2, 300);

  // 正文说明
  ctx.fillStyle = '#555';
  ctx.font = '30px SimSun';
  ctx.fillText('兹证明以下学员参加了培训学习，完成规定学时，特发此证。', canvas.width / 2, 360);

  // 底部信息
  ctx.fillStyle = '#888';
  ctx.font = '22px SimSun';
  ctx.textAlign = 'left';
  ctx.fillText('证书编号：', 180, canvas.height - 110);
  ctx.textAlign = 'right';
  ctx.fillText('发证单位（盖章）', canvas.width - 180, canvas.height - 110);

  // 转成blob上传
  canvas.toBlob(async (blob) => {
    const formData = new FormData();
    formData.append('file', blob, 'template.jpg');
    try {
      const resp = await adminFetch('/api/admin/upload-template', { method: 'POST', body: formData });
      const data = await resp.json();
      const resultEl = document.getElementById('templateResult');
      if (resp.ok && data.success) {
        resultEl.innerHTML = '<div class="alert alert-success">示例模板已生成并上传！请在下方配置文字位置</div>';
        loadTemplateEditor();
        loadStats();
      } else {
        resultEl.innerHTML = '<div class="alert alert-error">生成失败</div>';
      }
    } catch (e) {
      document.getElementById('templateResult').innerHTML = '<div class="alert alert-error">生成失败: ' + e.message + '</div>';
    }
    btn.disabled = false;
    btn.textContent = '没有模板？点击生成示例模板';
  }, 'image/jpeg', 0.95);
});

// ===== 可视化编辑器 =====
async function loadTemplateEditor() {
  // 获取配置
  const configResp = await adminFetch('/api/admin/config');
  if (!configResp.ok) return;
  editorConfig = await configResp.json();

  document.getElementById('orgNameInput').value = editorConfig.orgName || '';

  // 检查模板是否已上传
  const publicConfigResp = await fetch('/api/config');
  const publicConfig = await publicConfigResp.json();

  if (!publicConfig.templateUploaded) {
    document.getElementById('editorCard').style.display = 'none';
    return;
  }

  document.getElementById('editorCard').style.display = 'block';

  // 加载模板图片
  try {
    editorTemplateImg = await loadImage('/api/template?t=' + Date.now());
  } catch (e) {
    return;
  }

  editorCanvas = document.getElementById('editorCanvas');
  editorCtx = editorCanvas.getContext('2d');

  setupEditorEvents();
  renderEditor();
  renderFieldList();
}

function setupEditorEvents() {
  if (editorCanvas._eventsSetup) return;
  editorCanvas._eventsSetup = true;
  editorCanvas.addEventListener('mousedown', onEditorMouseDown);
  editorCanvas.addEventListener('mousemove', onEditorMouseMove);
  editorCanvas.addEventListener('mouseup', onEditorMouseUp);
  editorCanvas.addEventListener('mouseleave', onEditorMouseUp);
}

function getCanvasPos(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function onEditorMouseDown(e) {
  const pos = getCanvasPos(e);
  // 从后往前检测（上层优先）
  for (let i = editorConfig.fields.length - 1; i >= 0; i--) {
    const field = editorConfig.fields[i];
    const fx = field.x * editorCanvas.width;
    const fy = field.y * editorCanvas.height;
    const dist = Math.hypot(pos.x - fx, pos.y - fy);
    if (dist < 50) {
      selectedFieldIndex = i;
      isDragging = true;
      renderEditor();
      renderFieldList();
      return;
    }
  }
  selectedFieldIndex = -1;
  renderEditor();
  renderFieldList();
}

function onEditorMouseMove(e) {
  if (!isDragging || selectedFieldIndex < 0) return;
  const pos = getCanvasPos(e);
  const field = editorConfig.fields[selectedFieldIndex];
  field.x = Math.max(0, Math.min(1, pos.x / editorCanvas.width));
  field.y = Math.max(0, Math.min(1, pos.y / editorCanvas.height));
  renderEditor();
  // 只更新坐标显示，不重新渲染整个列表
  updateFieldCoords(selectedFieldIndex);
}

function onEditorMouseUp() {
  isDragging = false;
}

function renderEditor() {
  if (!editorTemplateImg || !editorConfig) return;
  editorCanvas.width = editorTemplateImg.naturalWidth;
  editorCanvas.height = editorTemplateImg.naturalHeight;
  editorCtx.drawImage(editorTemplateImg, 0, 0, editorCanvas.width, editorCanvas.height);

  editorConfig.fields.forEach((field, i) => {
    drawEditorField(field, i === selectedFieldIndex);
  });
}

function wrapEditorText(text, maxWidth) {
  const chars = text.split('');
  const lines = [];
  let current = '';
  for (let i = 0; i < chars.length; i++) {
    const test = current + chars[i];
    if (editorCtx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = chars[i];
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

function drawEditorField(field, selected) {
  let value = (field.customText && field.customText.trim()) ? field.customText.trim() : (fieldSamples[field.key] || field.label || '字段');
  if (field.key === 'hours' && !fieldSamples[field.key]) value = '16';

  const x = field.x * editorCanvas.width;
  const y = field.y * editorCanvas.height;

  const fontParts = [];
  if (field.fontWeight === 'bold') fontParts.push('bold');
  fontParts.push(field.fontSize + 'px');
  fontParts.push(field.fontFamily || 'SimSun');
  editorCtx.font = fontParts.join(' ');
  editorCtx.fillStyle = field.color || '#333';
  editorCtx.textBaseline = 'top';

  let boxX = x, boxY = y, boxW = 0, boxH = field.fontSize;

  if (field.maxWidth) {
    const maxWidth = field.maxWidth * editorCanvas.width;
    const firstIndent = (field.firstLineIndent || 0) * field.fontSize;
    const lines = wrapEditorText(value, maxWidth - firstIndent);
    const lineHeight = field.fontSize * (field.lineHeight || 1.5);
    const align = field.align || 'left';
    lines.forEach((line, index) => {
      const lx = x + (index === 0 ? firstIndent : 0);
      const textWidth = editorCtx.measureText(line).width;
      let drawX = lx;
      if (align === 'center') drawX = lx + maxWidth / 2 - textWidth / 2;
      else if (align === 'right') drawX = lx + maxWidth - textWidth;
      editorCtx.textAlign = 'left';
      editorCtx.fillText(line, drawX, y + index * lineHeight);
      if (index === 0) boxX = lx;
    });
    boxW = maxWidth;
    boxH = lines.length * lineHeight;
  } else {
    editorCtx.textAlign = field.align || 'center';
    editorCtx.fillText(value, x, y);
    const textWidth = editorCtx.measureText(value).width;
    boxW = textWidth;
    if (field.align === 'center') boxX = x - textWidth / 2;
    else if (field.align === 'right') boxX = x - textWidth;
  }

  if (selected) {
    const padX = 10, padY = 6;
    editorCtx.strokeStyle = '#667eea';
    editorCtx.lineWidth = 2;
    editorCtx.setLineDash([6, 4]);
    editorCtx.strokeRect(boxX - padX, boxY - padY, boxW + padX * 2, boxH + padY * 2);
    editorCtx.setLineDash([]);

    editorCtx.fillStyle = '#667eea';
    editorCtx.beginPath();
    editorCtx.arc(x, y, 6, 0, Math.PI * 2);
    editorCtx.fill();
  }
}

function renderFieldList() {
  const container = document.getElementById('fieldList');
  container.innerHTML = editorConfig.fields.map((field, i) => `
    <div class="field-item ${i === selectedFieldIndex ? 'selected' : ''}" data-index="${i}">
      <div class="field-header">
        <span class="field-label">${field.label}</span>
        <span class="field-key">${field.key}</span>
      </div>
      <div style="font-size:12px;color:#999;">
        位置: <span class="coord-${i}">X:${field.x.toFixed(2)} Y:${field.y.toFixed(2)}</span>
        | 字号:${field.fontSize}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.field-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedFieldIndex = parseInt(item.dataset.index);
      renderEditor();
      renderFieldList();
    });
  });

  renderFieldEditor();
}

function updateFieldCoords(index) {
  const el = document.querySelector('.coord-' + index);
  if (el) {
    const field = editorConfig.fields[index];
    el.textContent = 'X:' + field.x.toFixed(2) + ' Y:' + field.y.toFixed(2);
  }
}

function renderFieldEditor() {
  const container = document.getElementById('fieldEditor');
  if (selectedFieldIndex < 0) {
    container.innerHTML = '<p style="font-size:13px;color:#999;text-align:center;">点击字段进行编辑</p>';
    return;
  }
  const field = editorConfig.fields[selectedFieldIndex];
  container.innerHTML = `
    <div style="background:#f8f8f8;border-radius:8px;padding:16px;">
      <p style="font-weight:600;margin-bottom:12px;font-size:14px;">编辑「${field.label}」</p>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#777;">内容（人工修改）</label>
        <textarea id="edit-customText" rows="3" placeholder="留空 = 自动生成（学员姓名、证书编号、发证单位等）&#10;填写 = 所有证书固定显示这段文字" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-top:4px;resize:vertical;box-sizing:border-box;">${escapeHtml(field.customText || '')}</textarea>
        <p style="font-size:11px;color:#999;margin-top:4px;">留空则按系统自动内容生成；填写后该块在所有证书上固定显示此文字。</p>
      </div>
      <div class="field-controls">
        <div>
          <label>字体大小</label>
          <input type="number" id="edit-fontSize" value="${field.fontSize}" min="8" max="80">
        </div>
        <div>
          <label>颜色</label>
          <input type="color" id="edit-color" value="${field.color}">
        </div>
        <div>
          <label>对齐</label>
          <select id="edit-align">
            <option value="left" ${field.align === 'left' ? 'selected' : ''}>左对齐</option>
            <option value="center" ${field.align === 'center' ? 'selected' : ''}>居中</option>
            <option value="right" ${field.align === 'right' ? 'selected' : ''}>右对齐</option>
          </select>
        </div>
        <div>
          <label>粗体</label>
          <select id="edit-fontWeight">
            <option value="normal" ${field.fontWeight !== 'bold' ? 'selected' : ''}>常规</option>
            <option value="bold" ${field.fontWeight === 'bold' ? 'selected' : ''}>粗体</option>
          </select>
        </div>
        <div>
          <label>字体</label>
          <select id="edit-fontFamily">
            <option value="SimSun" ${field.fontFamily === 'SimSun' ? 'selected' : ''}>宋体</option>
            <option value="SimHei" ${field.fontFamily === 'SimHei' ? 'selected' : ''}>黑体</option>
            <option value="KaiTi" ${field.fontFamily === 'KaiTi' ? 'selected' : ''}>楷体</option>
            <option value="STXingkai, KaiTi, SimSun, serif" ${field.fontFamily && field.fontFamily.includes('STXingkai') ? 'selected' : ''}>华文行楷</option>
            <option value="FangSong" ${field.fontFamily === 'FangSong' ? 'selected' : ''}>仿宋</option>
            <option value="Microsoft YaHei" ${field.fontFamily === 'Microsoft YaHei' ? 'selected' : ''}>微软雅黑</option>
          </select>
        </div>
        <div>
          <label>显示名称</label>
          <input type="text" id="edit-label" value="${field.label}">
        </div>
      </div>
      <div style="margin-top:12px;">
        <label style="font-size:12px;color:#777;">X 坐标 (0-1)</label>
        <input type="number" id="edit-x" value="${field.x}" step="0.01" min="0" max="1" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;margin-top:4px;">
        <label style="font-size:12px;color:#777;margin-top:8px;display:block;">Y 坐标 (0-1)</label>
        <input type="number" id="edit-y" value="${field.y}" step="0.01" min="0" max="1" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;margin-top:4px;">
      </div>
      <div style="margin-top:12px;${field.key === 'bodyText' ? '' : 'display:none;'}">
        <label style="font-size:12px;color:#777;">最大宽度比例 (0-1)</label>
        <input type="number" id="edit-maxWidth" value="${field.maxWidth || 0.8}" step="0.01" min="0.1" max="1" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;margin-top:4px;">
        <label style="font-size:12px;color:#777;margin-top:8px;display:block;">行高倍数</label>
        <input type="number" id="edit-lineHeight" value="${field.lineHeight || 1.5}" step="0.1" min="0.5" max="3" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;margin-top:4px;">
        <label style="font-size:12px;color:#777;margin-top:8px;display:block;">首行缩进（字）</label>
        <input type="number" id="edit-firstLineIndent" value="${field.firstLineIndent || 0}" step="0.5" min="0" max="10" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;margin-top:4px;">
      </div>
      <button class="btn-secondary" id="deleteFieldBtn" style="margin-top:12px;width:100%;color:#c33;">删除此字段</button>
    </div>
    <button class="btn-secondary" id="addFieldBtn" style="margin-top:10px;width:100%;">+ 添加自定义字段</button>
  `;

  // 绑定属性变化事件
  const bindUpdate = (id, prop, parse) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      field[prop] = parse ? parse(el.value) : el.value;
      renderEditor();
    });
  };
  bindUpdate('edit-fontSize', 'fontSize', parseInt);
  bindUpdate('edit-color', 'color');
  bindUpdate('edit-customText', 'customText');
  bindUpdate('edit-fontFamily', 'fontFamily');
  bindUpdate('edit-align', 'align');
  bindUpdate('edit-fontWeight', 'fontWeight');
  bindUpdate('edit-label', 'label');
  bindUpdate('edit-x', 'x', parseFloat);
  bindUpdate('edit-y', 'y', parseFloat);
  bindUpdate('edit-maxWidth', 'maxWidth', parseFloat);
  bindUpdate('edit-lineHeight', 'lineHeight', parseFloat);
  bindUpdate('edit-firstLineIndent', 'firstLineIndent', parseFloat);

  document.getElementById('deleteFieldBtn').addEventListener('click', () => {
    if (!confirm('确定删除此字段？')) return;
    editorConfig.fields.splice(selectedFieldIndex, 1);
    selectedFieldIndex = -1;
    renderEditor();
    renderFieldList();
  });

  document.getElementById('addFieldBtn').addEventListener('click', () => {
    const key = prompt('请输入字段标识（英文，对应Excel列名，如：phone）：');
    if (!key) return;
    const label = prompt('请输入字段显示名称（如：联系电话）：');
    if (!label) return;
    editorConfig.fields.push({
      key: key.trim(),
      label: label.trim(),
      x: 0.5, y: 0.8,
      fontSize: 24, color: '#333',
      fontFamily: 'SimSun', align: 'center', fontWeight: 'normal'
    });
    selectedFieldIndex = editorConfig.fields.length - 1;
    renderEditor();
    renderFieldList();
  });
}

// 保存配置
document.getElementById('saveConfigBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('saveMsg');
  msgEl.textContent = '保存中...';
  msgEl.style.color = '#999';
  const resp = await adminFetch('/api/admin/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: editorConfig.fields, orgName: editorConfig.orgName })
  });
  if (resp.ok) {
    msgEl.textContent = '保存成功！';
    msgEl.style.color = '#389e0d';
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
  } else {
    msgEl.textContent = '保存失败';
    msgEl.style.color = '#cf1322';
  }
});

// ===== 设置 =====
async function loadSettings() {
  const resp = await adminFetch('/api/admin/config');
  if (!resp.ok) return;
  const config = await resp.json();
  document.getElementById('orgNameInput').value = config.orgName || '';
  document.getElementById('certificatePrefixInput').value = config.certificatePrefix || 'NLTS4124XP';
}

document.getElementById('saveOrgBtn').addEventListener('click', async () => {
  const orgName = document.getElementById('orgNameInput').value.trim();
  if (!orgName) { alert('请输入机构名称'); return; }
  if (editorConfig) editorConfig.orgName = orgName;
  const resp = await adminFetch('/api/admin/orgname', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName })
  });
  if (resp.ok) alert('保存成功'); else alert('保存失败');
});

document.getElementById('savePrefixBtn').addEventListener('click', async () => {
  const prefix = document.getElementById('certificatePrefixInput').value.trim();
  if (!prefix) { alert('请输入证书编号前缀'); return; }
  const resp = await adminFetch('/api/admin/certificate-prefix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix })
  });
  if (resp.ok) {
    if (editorConfig) editorConfig.certificatePrefix = prefix;
    alert('保存成功');
  } else {
    alert('保存失败');
  }
});

document.getElementById('changePwdBtn').addEventListener('click', async () => {
  const newPwd = document.getElementById('newPassword').value;
  if (!newPwd || newPwd.length < 4) { alert('密码至少4位'); return; }
  const resp = await adminFetch('/api/admin/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: newPwd })
  });
  if (resp.ok) {
    adminPassword = newPwd;
    document.getElementById('newPassword').value = '';
    alert('密码修改成功');
  } else {
    alert('修改失败');
  }
});

// ===== 发布到公网 =====
document.getElementById('publishBtn').addEventListener('click', async () => {
  const btn = document.getElementById('publishBtn');
  const resultEl = document.getElementById('publishResult');
  btn.disabled = true;
  btn.textContent = '正在生成静态网站...';
  resultEl.innerHTML = '<div class="alert alert-warning">正在打包数据和模板，生成公网版本...</div>';

  try {
    const resp = await adminFetch('/api/admin/build-static', { method: 'POST' });
    const data = await resp.json();
    if (resp.ok && data.success) {
      resultEl.innerHTML = '<div class="alert alert-success">静态网站已生成成功！包含 ' + data.studentCount + ' 名学员数据。<br>请告知管理员，系统已准备好部署到公网。</div>';
    } else {
      resultEl.innerHTML = '<div class="alert alert-error">' + (data.error || '生成失败') + '</div>';
    }
  } catch (e) {
    resultEl.innerHTML = '<div class="alert alert-error">生成失败: ' + e.message + '</div>';
  }
  btn.disabled = false;
  btn.textContent = '发布到公网';
});
