/**
 * 庆祝效果模块
 * 提供录制成功的烟花动画反馈效果
 *
 * 用法:
 *   const Celebrate = require('./celebrate');
 *   Celebrate.showSuccess(); // 显示成功烟花
 *   Celebrate.showSuccess({ message: '自定义消息' });
 */

/**
 * ANSI 颜色代码
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  yellow: '\x1b[33m',
  gold: '\x1b[38;5;220m',   // 金色
  orange: '\x1b[38;5;214m', // 橙色
  red: '\x1b[38;5;196m',    // 红色
  pink: '\x1b[38;5;213m',   // 粉色
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

/**
 * 烟花图案集合
 */
const FIREWORK_PATTERNS = [
  // 图案 1：对称烟花
  [
    '        ✨ *  ✨  *  ✨',
    '      *    🎊    *    🎊',
    '        ✨ *  ✨  *  ✨',
    '           🎯 完美！'
  ],
  // 图案 2：绽放烟花
  [
    '       🌟    ✨    🌟',
    '     ✨   🎉   ✨   🎉',
    '       🌟    ✨    🌟',
    '          🏆 太棒了！'
  ],
  // 图案 3：星星烟花
  [
    '      ⭐   ✦   ⭐   ✦',
    '    ✦   🎇   ✦   🎇',
    '      ⭐   ✦   ⭐   ✦',
    '         🥇 出色！'
  ]
];

/**
 * 鼓励文案集合
 */
const ENCOURAGING_MESSAGES = [
  '已记录您的选择，下次会更聪明哦~',
  '系统已学习，下次推荐更精准！',
  '您的偏好已保存，越用越顺手！',
  '智能记忆生效，下次更懂你！',
  '学习数据已更新，持续进化中！'
];

/**
 * 成功标题集合
 */
const SUCCESS_HEADERS = [
  '🎉🎉🎉 录制成功！🎉🎉🎉',
  '🎊🎊🎊 操作完成！🎊🎊🎊',
  '✨✨✨ 步骤记录成功！✨✨✨'
];

/**
 * 显示烟花效果
 * @param {Object} options - 配置选项
 * @param {string} options.message - 自定义消息
 * @param {number} options.patternIndex - 指定烟花图案索引
 * @param {boolean} options.animated - 是否启用动画效果（默认 false）
 */
function showSuccess(options = {}) {
  const {
    message = null,
    patternIndex = Math.floor(Math.random() * FIREWORK_PATTERNS.length),
    animated = false
  } = options;

  // 选择随机或指定的图案
  const pattern = FIREWORK_PATTERNS[patternIndex] || FIREWORK_PATTERNS[0];
  const header = SUCCESS_HEADERS[Math.floor(Math.random() * SUCCESS_HEADERS.length)];
  const encouragingMsg = message || ENCOURAGING_MESSAGES[Math.floor(Math.random() * ENCOURAGING_MESSAGES.length)];

  // 构建输出内容
  let output = '\n';

  // 标题（带颜色）
  output += `${COLORS.gold}${COLORS.bright}${header}${COLORS.reset}\n\n`;

  // 烟花图案（彩色）
  pattern.forEach((line, index) => {
    // 根据行选择颜色
    const color = index === pattern.length - 1 ? COLORS.green : COLORS.yellow;
    output += `${color}${line}${COLORS.reset}\n`;
  });

  output += '\n';

  // 鼓励消息
  output += `${COLORS.cyan}    ${encouragingMsg}${COLORS.reset}\n`;
  output += '\n';

  // 输出到终端
  if (animated) {
    // 动画模式：逐行输出
    const lines = output.split('\n');
    lines.forEach((line, i) => {
      setTimeout(() => {
        console.log(line);
      }, i * 100);
    });
  } else {
    // 直接输出
    console.log(output);
  }
}

/**
 * 显示简单成功提示（无烟花）
 * @param {string} message - 成功消息
 */
function showSimpleSuccess(message = '操作成功！') {
  console.log(`\n${COLORS.green}✓ ${message}${COLORS.reset}\n`);
}

/**
 * 显示录制步骤完成提示
 * @param {number} stepNumber - 步骤编号
 * @param {string} stepDesc - 步骤描述
 */
function showStepSuccess(stepNumber, stepDesc = '') {
  console.log(`\n${COLORS.green}✓ 步骤 ${stepNumber} 已完成${stepDesc ? `: ${stepDesc}` : ''}${COLORS.reset}\n`);
}

/**
 * 显示错误提示
 * @param {string} message - 错误消息
 */
function showError(message) {
  console.log(`\n${COLORS.red}✗ ${message}${COLORS.reset}\n`);
}

/**
 * 显示警告提示
 * @param {string} message - 警告消息
 */
function showWarning(message) {
  console.log(`\n${COLORS.yellow}⚠ ${message}${COLORS.reset}\n`);
}

/**
 * 显示信息提示
 * @param {string} message - 信息消息
 */
function showInfo(message) {
  console.log(`\n${COLORS.cyan}ℹ ${message}${COLORS.reset}\n`);
}

/**
 * 显示录制结束交互菜单
 * @param {number} stepNumber - 当前步骤编号
 * @returns {string} 格式化的菜单文本
 */
function showRecordEndMenu(stepNumber) {
  const menu = `\n步骤 ${stepNumber} 已完成！请选择下一步：
  ${COLORS.bright}[1]${COLORS.reset} 继续录制 - 添加更多操作步骤
  ${COLORS.bright}[2]${COLORS.reset} 完成录制 - 生成测试脚本
  ${COLORS.bright}[3]${COLORS.reset} 回放验证 - 运行刚才录制的步骤
  ${COLORS.bright}[4]${COLORS.reset} 查看摘要 - 显示已录制的所有步骤

  请输入选项编号: `;
  return menu;
}

/**
 * 清除终端输出（可选）
 */
function clearScreen() {
  console.log('\x1b[2J\x1b[H');
}

// 导出模块
module.exports = {
  showSuccess,
  showSimpleSuccess,
  showStepSuccess,
  showError,
  showWarning,
  showInfo,
  showRecordEndMenu,
  clearScreen,
  COLORS,
  FIREWORK_PATTERNS,
  ENCOURAGING_MESSAGES
};