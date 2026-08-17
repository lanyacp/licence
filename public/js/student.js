// 学员端逻辑
let currentStudent = null;
let certificateCanvas = null;

document.getElementById('verifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const idNumber = document.getElementById('idNumber').value.trim();
  const msgEl = document.getElementById('message');
  const btn = document.getElementById('submitBtn');

  if (!name || !idNumber) {
    showMessage('请输入姓名和身份证号', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '查询中...';
  msgEl.className = 'message';

  try {
    const resp = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, idNumber })
    });

    const data = await resp.json();

    if (!resp.ok) {
      showMessage(data.error || '验证失败', 'error');
      btn.disabled = false;
      btn.textContent = '查询并生成证书';
      return;
    }

    currentStudent = data.student;
    await showCertificate();
  } catch (err) {
    showMessage('网络错误，请稍后重试', 'error');
    btn.disabled = false;
    btn.textContent = '查询并生成证书';
  }
});

async function showCertificate() {
  // 检查模板是否已上传
  const configResp = await fetch('/api/config');
  const config = await configResp.json();

  if (!config.templateUploaded) {
    showMessage('证书模板尚未配置，请联系管理员', 'error');
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('submitBtn').textContent = '查询并生成证书';
    return;
  }

  // 加载模板图片
  let templateImg;
  try {
    templateImg = await loadImage('/api/template?t=' + Date.now());
  } catch (e) {
    showMessage('模板加载失败', 'error');
    return;
  }

  // 绘制证书
  certificateCanvas = document.getElementById('certificateCanvas');
  drawCertificate(certificateCanvas, currentStudent, config, templateImg);

  // 切换显示
  document.getElementById('verifySection').style.display = 'none';
  document.getElementById('resultSection').style.display = 'block';
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('submitBtn').textContent = '查询并生成证书';
  window.scrollTo(0, 0);
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!certificateCanvas) return;
  const filename = currentStudent.name + '-结业证书.jpg';
  downloadCanvas(certificateCanvas, filename);
});

document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('verifySection').style.display = 'flex';
  document.getElementById('name').value = '';
  document.getElementById('idNumber').value = '';
  document.getElementById('message').className = 'message';
  currentStudent = null;
});

function showMessage(text, type) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.className = 'message ' + type;
}
