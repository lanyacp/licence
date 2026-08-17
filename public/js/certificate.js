// 证书生成公共逻辑 - 学员端和管理端共用

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '年' + m + '月' + day + '日';
}

function getFieldValue(field, student, config) {
  // 人工修改内容优先：配置了 customText 则所有证书固定显示该文字
  if (field.customText && field.customText.trim()) return field.customText.trim();
  if (field.key === 'orgName') return config.orgName || '';
  if (field.key === 'issueDate') return student.issueDate || '';
  if (field.key === 'certificateNumber') return '编号：' + (student.certificateNumber || '');
  return student[field.key] || '';
}

function wrapText(ctx, text, maxWidth) {
  const chars = text.split('');
  const lines = [];
  let current = '';
  for (let i = 0; i < chars.length; i++) {
    const test = current + chars[i];
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = chars[i];
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

function drawWrappedText(ctx, text, x, y, field, canvasWidth) {
  const maxWidth = (field.maxWidth || 0.8) * canvasWidth;
  const firstIndent = (field.firstLineIndent || 0) * field.fontSize;
  const lines = wrapText(ctx, text, maxWidth - firstIndent);
  const lineHeight = field.fontSize * (field.lineHeight || 1.5);
  const align = field.align || 'left';
  lines.forEach((line, index) => {
    const lx = x + (index === 0 ? firstIndent : 0);
    const textWidth = ctx.measureText(line).width;
    let drawX = lx;
    if (align === 'center') drawX = lx + maxWidth / 2 - textWidth / 2;
    else if (align === 'right') drawX = lx + maxWidth - textWidth;
    ctx.fillText(line, drawX, y + index * lineHeight);
  });
}

function drawSingleField(ctx, field, value, x, y, canvasWidth) {
  const align = field.align || 'left';
  ctx.textBaseline = 'top';
  if (field.maxWidth) {
    ctx.textAlign = 'left';
    drawWrappedText(ctx, value, x, y, field, canvasWidth);
  } else {
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
}

/**
 * 在Canvas上绘制证书
 * @param {HTMLCanvasElement} canvas
 * @param {Object} student - 学员数据
 * @param {Object} config - 配置 { fields, orgName }
 * @param {HTMLImageElement} templateImg - 模板图片
 */
function drawCertificate(canvas, student, config, templateImg) {
  const ctx = canvas.getContext('2d');

  // 设置canvas尺寸为模板原始尺寸（高清）
  canvas.width = templateImg.naturalWidth;
  canvas.height = templateImg.naturalHeight;

  // 绘制模板背景
  ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

  // 绘制每个字段
  (config.fields || []).forEach(field => {
    const value = getFieldValue(field, student, config);
    if (!value) return;

    const x = field.x * canvas.width;
    const y = field.y * canvas.height;
    const fontParts = [];
    if (field.fontWeight === 'bold') fontParts.push('bold');
    fontParts.push(field.fontSize + 'px');
    fontParts.push(field.fontFamily || 'SimSun');
    ctx.font = fontParts.join(' ');
    ctx.fillStyle = field.color || '#333';

    drawSingleField(ctx, field, value, x, y, canvas.width);
  });
}

/**
 * 下载canvas为图片
 */
function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.click();
}
