// ===== 批量导出证书（纯浏览器端，数据不出本机）=====
let exportStudents = [];
let exportConfig = null;
let exportTemplateImg = null;

// 清理文件/文件夹名中的非法字符（Windows）
function sanitizeName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '未命名';
}

async function loadExportPanel() {
  const summaryEl = document.getElementById('exportSummary');
  const select = document.getElementById('exportTownshipSelect');
  const resultEl = document.getElementById('exportResult');
  resultEl.innerHTML = '';
  summaryEl.textContent = '正在加载学员数据...';
  select.innerHTML = '<option value="">加载中...</option>';

  // 加载学员数据
  try {
    const resp = await adminFetch('/api/admin/students');
    const data = await resp.json();
    exportStudents = data.students || [];
  } catch (e) {
    summaryEl.innerHTML = '<span style="color:#c33;">学员数据加载失败</span>';
    return;
  }

  // 加载配置
  try {
    const configResp = await adminFetch('/api/admin/config');
    exportConfig = await configResp.json();
  } catch (e) {
    summaryEl.innerHTML = '<span style="color:#c33;">配置加载失败</span>';
    return;
  }

  // 检查模板
  const publicConfig = await (await fetch('/api/config')).json();
  if (!publicConfig.templateUploaded) {
    summaryEl.innerHTML = '<span style="color:#c33;">尚未上传证书模板，请先到「模板配置」上传模板。</span>';
    select.innerHTML = '<option value="">无模板</option>';
    return;
  }

  if (exportStudents.length === 0) {
    summaryEl.innerHTML = '<span style="color:#c33;">暂无学员数据，请先在「数据管理」上传 Excel。</span>';
    select.innerHTML = '<option value="">无数据</option>';
    return;
  }

  // 按乡镇分组统计
  const townshipMap = {};
  exportStudents.forEach(function (s) {
    const t = (s.township && s.township.trim()) ? s.township.trim() : '未填写乡镇';
    townshipMap[t] = (townshipMap[t] || 0) + 1;
  });
  const townships = Object.keys(townshipMap).sort(function (a, b) { return a.localeCompare(b, 'zh'); });

  // 渲染下拉框
  let opts = '<option value="__ALL__">全部乡镇（共 ' + exportStudents.length + ' 人）</option>';
  townships.forEach(function (t) {
    opts += '<option value="' + t + '">' + t + '（' + townshipMap[t] + ' 人）</option>';
  });
  select.innerHTML = opts;

  updateExportSummary();
  select.onchange = updateExportSummary;
}

function getExportTargetStudents() {
  const val = document.getElementById('exportTownshipSelect').value;
  if (val === '__ALL__') return exportStudents.slice();
  return exportStudents.filter(function (s) {
    const t = (s.township && s.township.trim()) ? s.township.trim() : '未填写乡镇';
    return t === val;
  });
}

function updateExportSummary() {
  const summaryEl = document.getElementById('exportSummary');
  const targets = getExportTargetStudents();
  const projMap = {};
  targets.forEach(function (s) {
    const p = (s.project && s.project.trim()) ? s.project.trim() : '未分类项目';
    projMap[p] = (projMap[p] || 0) + 1;
  });
  const projCount = Object.keys(projMap).length;
  summaryEl.innerHTML = '将导出 <strong>' + targets.length + '</strong> 张证书，涵盖 <strong>' + projCount + '</strong> 个培训项目。';
}

document.getElementById('startExportBtn').addEventListener('click', async function () {
  const btn = document.getElementById('startExportBtn');
  const progressWrap = document.getElementById('exportProgress');
  const progressBar = document.getElementById('exportProgressBar');
  const progressText = document.getElementById('exportProgressText');
  const resultEl = document.getElementById('exportResult');
  const usePng = document.getElementById('exportPngChk').checked;

  const targets = getExportTargetStudents();
  if (targets.length === 0) {
    resultEl.innerHTML = '<div class="alert alert-error">没有可导出的学员</div>';
    return;
  }

  if (!exportTemplateImg) {
    try {
      exportTemplateImg = await loadImage('/api/template?t=' + Date.now());
    } catch (e) {
      resultEl.innerHTML = '<div class="alert alert-error">模板图片加载失败</div>';
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = '正在生成...';
  resultEl.innerHTML = '';
  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '准备中...';

  const zip = new JSZip();
  const canvas = document.getElementById('exportCanvas');
  const ext = usePng ? 'png' : 'jpg';
  const mime = usePng ? 'image/png' : 'image/jpeg';
  const quality = usePng ? undefined : 0.95;

  const usedPaths = {};

  try {
    for (let i = 0; i < targets.length; i++) {
      const student = targets[i];

      // 绘制证书
      drawCertificate(canvas, student, exportConfig, exportTemplateImg);

      // 转 blob
      const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, mime, quality); });

      // 构建路径：乡镇/项目/姓名-证书编号.ext
      const township = sanitizeName((student.township && student.township.trim()) ? student.township.trim() : '未填写乡镇');
      const project = sanitizeName((student.project && student.project.trim()) ? student.project.trim() : '未分类项目');
      const fileBase = sanitizeName(student.name + (student.certificateNumber ? '-' + student.certificateNumber : ''));
      let relPath = township + '/' + project + '/' + fileBase + '.' + ext;

      // 避免重名
      if (usedPaths[relPath]) {
        usedPaths[relPath]++;
        relPath = township + '/' + project + '/' + fileBase + '(' + usedPaths[relPath] + ').' + ext;
      } else {
        usedPaths[relPath] = 1;
      }

      zip.file(relPath, blob);

      const pct = Math.round(((i + 1) / targets.length) * 100);
      progressBar.style.width = pct + '%';
      progressText.textContent = '正在生成 ' + (i + 1) + ' / ' + targets.length + '：' + student.name;

      // 让出主线程，避免界面卡死
      if (i % 5 === 0) await new Promise(function (r) { setTimeout(r, 0); });
    }

    progressText.textContent = '正在打包 ZIP，请稍候...';

    const selVal = document.getElementById('exportTownshipSelect').value;
    const townshipLabel = selVal === '__ALL__' ? '全部乡镇' : sanitizeName(selVal);
    const zipName = '学时证书-' + townshipLabel + '-' + new Date().toISOString().slice(0, 10) + '.zip';

    const content = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      function (meta) {
        progressBar.style.width = meta.percent.toFixed(0) + '%';
        progressText.textContent = '正在压缩：' + meta.percent.toFixed(0) + '%';
      }
    );

    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipName;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

    progressBar.style.width = '100%';
    progressText.textContent = '完成！';
    resultEl.innerHTML = '<div class="alert alert-success">已成功导出 <strong>' + targets.length + '</strong> 张证书，文件名：' + zipName + '。<br>压缩包内按「乡镇 / 培训项目」两级文件夹分类存放。</div>';
  } catch (e) {
    resultEl.innerHTML = '<div class="alert alert-error">导出失败: ' + e.message + '</div>';
  }

  btn.disabled = false;
  btn.textContent = '开始导出';
});
