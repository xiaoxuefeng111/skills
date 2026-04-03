/**
 * 流程审核分析脚本
 * 分析现有测试脚本的流程合理性和元素定位器稳定性
 *
 * 用法: node analyze-flow.js <测试文件路径> [测试目录路径]
 * 示例: node analyze-flow.js test-complete-buy.js
 *       node analyze-flow.js test-complete-buy.js /path/to/appium-tests
 */
const fs = require('fs');
const path = require('path');

// 从命令行获取测试文件路径和测试目录
const testFilePath = process.argv[2];
const appiumTestsDir = process.argv[3] || process.env.APPIUM_TESTS_DIR || './appium-tests';

if (!testFilePath) {
  console.error('用法: node analyze-flow.js <测试文件路径> [测试目录路径]');
  console.error('示例: node analyze-flow.js test-complete-buy.js');
  process.exit(1);
}

// 测试目录
const APPIUM_TESTS_DIR = path.resolve(appiumTestsDir);
const fullTestPath = path.isAbsolute(testFilePath)
  ? testFilePath
  : path.join(APPIUM_TESTS_DIR, testFilePath);

/**
 * 定位器稳定性评分
 */
const LOCATOR_STABILITY = {
  // 高稳定性 (8-10分)
  resourceId: {
    pattern: /resource-id|@id|\$\('#|get\('[^']+'\)/gi,
    score: 10,
    name: 'resource-id',
    reason: '基于资源ID定位，App更新后通常保持稳定'
  },

  // 中等稳定性 (5-7分)
  contentDesc: {
    pattern: /content-desc|accessibility-id|contentDesc/gi,
    score: 7,
    name: 'content-desc',
    reason: '基于无障碍描述定位，UI变化可能影响'
  },
  hint: {
    pattern: /hint|placeholder/gi,
    score: 6,
    name: 'hint',
    reason: '基于输入提示定位，提示文本可能变化'
  },

  // 低稳定性 (1-4分)
  text: {
    pattern: /\[@text=|text="[^"]*"\]|\.text\(\)|text='[^']*'/gi,
    score: 4,
    name: 'text属性',
    reason: '基于文本定位，多语言或文案变化会导致失败'
  },
  class: {
    pattern: /class="[^"]*"|\[@class=/gi,
    score: 2,
    name: 'class属性',
    reason: '基于类名定位，可能匹配多个元素'
  },

  // 特殊定位方式
  xpath: {
    pattern: /\/\//g,
    score: 5,
    name: 'XPath',
    reason: 'XPath路径依赖DOM结构，UI变化易导致失败'
  },
  coordinates: {
    pattern: /touchAction|tap.*x.*y|bounds/gi,
    score: 3,
    name: '坐标定位',
    reason: '坐标定位依赖屏幕尺寸，不同设备可能失败'
  }
};

/**
 * 流程步骤分析模式
 */
const FLOW_PATTERNS = {
  wait: {
    pattern: /waitForElement|waitFor|pause|sleep|wait/gi,
    category: '等待',
    good: '等待元素出现或固定时间'
  },
  click: {
    pattern: /\.click\(\)|touchAction.*tap/gi,
    category: '点击',
    good: '触发按钮或元素点击'
  },
  input: {
    pattern: /\.setValue\(\)|\.addValue\(\)|\.clearValue\(\)|input|type/gi,
    category: '输入',
    good: '向输入框输入内容'
  },
  assert: {
    pattern: /expect|assert|should|isDisplayed|getText/gi,
    category: '验证',
    good: '验证元素状态或文本'
  },
  screenshot: {
    pattern: /screenshot|takeScreenshot/gi,
    category: '截图',
    good: '记录当前状态'
  },
  scroll: {
    pattern: /scroll|swipe|drag/gi,
    category: '滚动',
    good: '滚动屏幕或列表'
  }
};

/**
 * 分析定位器稳定性
 */
function analyzeLocators(code) {
  const locators = [];
  let totalScore = 0;
  let count = 0;

  for (const [type, config] of Object.entries(LOCATOR_STABILITY)) {
    const matches = code.match(config.pattern) || [];
    if (matches.length > 0) {
      locators.push({
        type,
        name: config.name,
        count: matches.length,
        score: config.score,
        reason: config.reason,
        examples: matches.slice(0, 3)
      });
      totalScore += config.score * matches.length;
      count += matches.length;
    }
  }

  const avgScore = count > 0 ? (totalScore / count).toFixed(1) : 0;

  return { locators, avgScore, totalLocatorCount: count };
}

/**
 * 分析流程步骤
 */
function analyzeFlowSteps(code) {
  const steps = [];

  for (const [type, config] of Object.entries(FLOW_PATTERNS)) {
    const matches = code.match(config.pattern) || [];
    if (matches.length > 0) {
      steps.push({
        type,
        category: config.category,
        count: matches.length,
        description: config.good
      });
    }
  }

  return steps;
}

/**
 * 提取等待时间分析
 */
function analyzeWaitTimes(code) {
  const pausePattern = /pause\((\d+)\)|sleep\((\d+)\)|wait.*?(\d+)/gi;
  const waits = [];
  let match;

  while ((match = pausePattern.exec(code)) !== null) {
    const time = parseInt(match[1] || match[2] || match[3]);
    if (time > 0) {
      waits.push({
        time,
        line: findLineNumber(code, match.index),
        suggestion: time > 3000 ? '考虑使用 waitForElement 代替固定等待' : '合理'
      });
    }
  }

  const totalWaitTime = waits.reduce((sum, w) => sum + w.time, 0);

  return { waits, totalWaitTime };
}

/**
 * 查找行号
 */
function findLineNumber(code, index) {
  const lines = code.substring(0, index).split('\n');
  return lines.length;
}

/**
 * 检测潜在问题
 */
function detectIssues(code, locatorAnalysis) {
  const issues = [];

  // 检测硬编码等待
  if (code.includes('pause(2000)') || code.includes('pause(3000)')) {
    issues.push({
      severity: 'warning',
      type: '硬编码等待',
      message: '发现较长的固定等待时间，建议使用 waitForElement',
      suggestion: '使用 waitForElement 等待元素可见后再操作'
    });
  }

  // 检测坐标定位
  if (code.includes('touchAction') || code.includes('bounds')) {
    issues.push({
      severity: 'warning',
      type: '坐标定位',
      message: '使用坐标定位可能在不同设备上失败',
      suggestion: '优先使用 resource-id 或 content-desc 定位'
    });
  }

  // 检测低稳定性定位器
  const lowStabilityCount = locatorAnalysis.locators
    .filter(l => l.score <= 4)
    .reduce((sum, l) => sum + l.count, 0);

  if (lowStabilityCount > 5) {
    issues.push({
      severity: 'warning',
      type: '低稳定性定位器过多',
      message: `发现 ${lowStabilityCount} 个低稳定性定位器 (text/class)`,
      suggestion: '建议联系开发添加 resource-id 或 content-desc'
    });
  }

  // 检测缺少错误处理
  const tryCatchCount = (code.match(/try\s*{/g) || []).length;
  const operationCount = (code.match(/\.click\(\)|\.setValue\(/g) || []).length;

  if (operationCount > 3 && tryCatchCount < operationCount / 2) {
    issues.push({
      severity: 'info',
      type: '错误处理',
      message: '部分操作缺少 try-catch 错误处理',
      suggestion: '为关键操作添加 try-catch 以提高测试稳定性'
    });
  }

  // 检测缺少断言
  if (!code.includes('expect') && !code.includes('assert')) {
    issues.push({
      severity: 'info',
      type: '缺少断言',
      message: '测试脚本中没有发现断言语句',
      suggestion: '添加断言以验证操作结果'
    });
  }

  return issues;
}

/**
 * 生成审核报告
 */
function generateAuditReport(filePath, code, analysis) {
  const { locators, flowSteps, waitAnalysis, issues, avgScore } = analysis;

  let report = `# 测试脚本审核报告\n\n`;
  report += `**文件**: ${path.basename(filePath)}\n`;
  report += `**路径**: ${filePath}\n`;
  report += `**审核时间**: ${new Date().toLocaleString()}\n`;
  report += `**代码行数**: ${code.split('\n').length}\n\n`;

  // 总体评分
  const overallScore = Math.min(10, Math.max(1, parseFloat(avgScore)));
  const scoreEmoji = overallScore >= 7 ? '✅' : overallScore >= 4 ? '⚠️' : '❌';

  report += `## 总体评估\n\n`;
  report += `| 指标 | 值 |\n`;
  report += `|------|----|\n`;
  report += `| 定位器稳定性评分 | ${scoreEmoji} ${avgScore}/10 |\n`;
  report += `| 流程步骤数 | ${flowSteps.reduce((s, f) => s + f.count, 0)} |\n`;
  report += `| 总等待时间 | ${(waitAnalysis.totalWaitTime / 1000).toFixed(1)}秒 |\n`;
  report += `| 问题数量 | ${issues.length} |\n\n`;

  // 定位器分析
  report += `## 定位器分析\n\n`;
  report += `| 定位方式 | 数量 | 稳定性 | 说明 |\n`;
  report += `|----------|------|--------|------|\n`;
  locators.sort((a, b) => b.score - a.score).forEach(l => {
    const stability = l.score >= 7 ? '✅ 高' : l.score >= 5 ? '⚠️ 中' : '❌ 低';
    report += `| ${l.name} | ${l.count} | ${stability} | ${l.reason} |\n`;
  });
  report += '\n';

  // 流程步骤
  report += `## 流程步骤分析\n\n`;
  report += `| 类型 | 数量 | 说明 |\n`;
  report += `|------|------|------|\n`;
  flowSteps.forEach(f => {
    report += `| ${f.category} | ${f.count} | ${f.description} |\n`;
  });
  report += '\n';

  // 等待时间分析
  if (waitAnalysis.waits.length > 0) {
    report += `## 等待时间分析\n\n`;
    report += `| 行号 | 等待时间 | 建议 |\n`;
    report += `|------|----------|------|\n`;
    waitAnalysis.waits.slice(0, 10).forEach(w => {
      report += `| ${w.line} | ${w.time}ms | ${w.suggestion} |\n`;
    });
    report += `\n**总等待时间**: ${(waitAnalysis.totalWaitTime / 1000).toFixed(1)}秒\n\n`;
  }

  // 问题列表
  if (issues.length > 0) {
    report += `## 发现的问题\n\n`;
    issues.forEach((issue, i) => {
      const icon = issue.severity === 'error' ? '❌' :
                   issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      report += `### ${icon} ${i + 1}. ${issue.type}\n\n`;
      report += `**严重程度**: ${issue.severity}\n\n`;
      report += `**问题**: ${issue.message}\n\n`;
      report += `**建议**: ${issue.suggestion}\n\n`;
    });
  }

  // 优化建议
  report += `## 优化建议\n\n`;

  if (avgScore < 5) {
    report += `1. **提高定位器稳定性**: 当前定位器稳定性较低，建议:\n`;
    report += `   - 联系开发为关键元素添加 resource-id\n`;
    report += `   - 使用 content-desc 作为备选定位方式\n\n`;
  }

  if (waitAnalysis.totalWaitTime > 10000) {
    report += `2. **优化等待策略**: 总等待时间较长，建议:\n`;
    report += `   - 使用 waitForElement 替代固定等待\n`;
    report += `   - 设置合理的超时时间\n\n`;
  }

  if (code.includes('touchAction')) {
    report += `3. **避免坐标定位**: 发现坐标定位，建议:\n`;
    report += `   - 使用元素定位器替代坐标点击\n`;
    report += `   - 如必须使用坐标，添加设备适配逻辑\n\n`;
  }

  report += `---\n`;
  report += `*报告由 appium-flow-audit 自动生成*\n`;

  return report;
}

/**
 * 主函数
 */
async function analyzeFlow() {
  console.log('=== 流程审核分析器 ===\n');

  // 检查文件是否存在
  if (!fs.existsSync(fullTestPath)) {
    console.error(`错误: 文件不存在: ${fullTestPath}`);
    process.exit(1);
  }

  console.log(`分析文件: ${fullTestPath}\n`);

  // 读取代码
  const code = fs.readFileSync(fullTestPath, 'utf-8');

  // 执行分析
  console.log('[1/4] 分析定位器稳定性...');
  const locatorAnalysis = analyzeLocators(code);
  console.log(`   发现 ${locatorAnalysis.totalLocatorCount} 个定位器, 平均稳定性: ${locatorAnalysis.avgScore}/10`);

  console.log('[2/4] 分析流程步骤...');
  const flowSteps = analyzeFlowSteps(code);
  console.log(`   发现 ${flowSteps.length} 种操作类型`);

  console.log('[3/4] 分析等待时间...');
  const waitAnalysis = analyzeWaitTimes(code);
  console.log(`   总等待时间: ${(waitAnalysis.totalWaitTime / 1000).toFixed(1)}秒`);

  console.log('[4/4] 检测潜在问题...');
  const issues = detectIssues(code, locatorAnalysis);
  console.log(`   发现 ${issues.length} 个问题`);

  // 生成报告
  const analysis = {
    locators: locatorAnalysis.locators,
    flowSteps,
    waitAnalysis,
    issues,
    avgScore: locatorAnalysis.avgScore
  };

  const report = generateAuditReport(fullTestPath, code, analysis);

  // 保存报告
  const reportDir = path.join(APPIUM_TESTS_DIR, 'audit-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, `audit_${path.basename(testFilePath, '.js')}_${Date.now()}.md`);
  fs.writeFileSync(reportPath, report);

  console.log('\n=== 审核完成 ===');
  console.log(`报告已保存: ${reportPath}`);

  // 输出摘要
  console.log('\n=== 审核摘要 ===');
  console.log(`定位器稳定性: ${locatorAnalysis.avgScore}/10`);
  console.log(`总等待时间: ${(waitAnalysis.totalWaitTime / 1000).toFixed(1)}秒`);
  console.log(`问题数量: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n主要问题:');
    issues.slice(0, 3).forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.severity}] ${issue.type}: ${issue.message}`);
    });
  }
}

analyzeFlow();