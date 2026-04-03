/**
 * Celebrate 模块单元测试
 * 测试烟花效果和录制交互功能
 */

const path = require('path');
const assert = require('assert');

// 加载被测模块
const Celebrate = require(path.join(__dirname, '../scripts/celebrate.js'));

// 测试结果收集
const testResults = {
  passed: [],
  failed: []
};

function runTest(name, testFn) {
  try {
    testFn();
    testResults.passed.push(name);
    console.log(`✓ ${name}`);
  } catch (error) {
    testResults.failed.push({ name, error: error.message });
    console.log(`✗ ${name}: ${error.message}`);
  }
}

console.log('\n========================================');
console.log('  Celebrate 模块单元测试');
console.log('========================================\n');

// ========== 测试 1: 模块导出验证 ==========
runTest('1.1 模块导出 - showSuccess 函数存在', () => {
  assert.ok(typeof Celebrate.showSuccess === 'function', 'showSuccess 应为函数');
});

runTest('1.2 模块导出 - showSimpleSuccess 函数存在', () => {
  assert.ok(typeof Celebrate.showSimpleSuccess === 'function', 'showSimpleSuccess 应为函数');
});

runTest('1.3 模块导出 - showStepSuccess 函数存在', () => {
  assert.ok(typeof Celebrate.showStepSuccess === 'function', 'showStepSuccess 应为函数');
});

runTest('1.4 模块导出 - showError 函数存在', () => {
  assert.ok(typeof Celebrate.showError === 'function', 'showError 应为函数');
});

runTest('1.5 模块导出 - showWarning 函数存在', () => {
  assert.ok(typeof Celebrate.showWarning === 'function', 'showWarning 应为函数');
});

runTest('1.6 模块导出 - showInfo 函数存在', () => {
  assert.ok(typeof Celebrate.showInfo === 'function', 'showInfo 应为函数');
});

runTest('1.7 模块导出 - showRecordEndMenu 函数存在', () => {
  assert.ok(typeof Celebrate.showRecordEndMenu === 'function', 'showRecordEndMenu 应为函数');
});

runTest('1.8 模块导出 - clearScreen 函数存在', () => {
  assert.ok(typeof Celebrate.clearScreen === 'function', 'clearScreen 应为函数');
});

// ========== 测试 2: COLORS 常量验证 ==========
runTest('2.1 COLORS - 包含必要颜色代码', () => {
  const COLORS = Celebrate.COLORS;

  assert.ok(COLORS.reset, '应有 reset 颜色');
  assert.ok(COLORS.bright, '应有 bright 颜色');
  assert.ok(COLORS.yellow, '应有 yellow 颜色');
  assert.ok(COLORS.gold, '应有 gold 颜色');
  assert.ok(COLORS.green, '应有 green 颜色');
  assert.ok(COLORS.cyan, '应有 cyan 颜色');
  assert.ok(COLORS.red, '应有 red 颜色');
});

// ========== 测试 3: FIREWORK_PATTERNS 验证 ==========
runTest('3.1 FIREWORK_PATTERNS - 包含烟花图案', () => {
  const patterns = Celebrate.FIREWORK_PATTERNS;

  assert.ok(Array.isArray(patterns), '应为数组');
  assert.ok(patterns.length >= 3, '应有至少 3 个图案');

  // 验证每个图案结构
  patterns.forEach((pattern, i) => {
    assert.ok(Array.isArray(pattern), `图案 ${i} 应为数组`);
    assert.ok(pattern.length >= 3, `图案 ${i} 应有至少 3 行`);
  });
});

// ========== 测试 4: ENCOURAGING_MESSAGES 验证 ==========
runTest('4.1 ENCOURAGING_MESSAGES - 包含鼓励文案', () => {
  const messages = Celebrate.ENCOURAGING_MESSAGES;

  assert.ok(Array.isArray(messages), '应为数组');
  assert.ok(messages.length >= 3, '应有至少 3 条文案');

  // 验证每条文案内容
  messages.forEach((msg, i) => {
    assert.ok(typeof msg === 'string', `文案 ${i} 应为字符串`);
    assert.ok(msg.length > 0, `文案 ${i} 不应为空`);
  });
});

// ========== 测试 5: showSuccess 参数验证 ==========
runTest('5.1 showSuccess - 无参数调用', () => {
  // 应能正常执行，不抛异常
  Celebrate.showSuccess();
  // 函数执行无返回值验证（只验证不报错）
  assert.ok(true, '无参数调用应正常执行');
});

runTest('5.2 showSuccess - 自定义消息参数', () => {
  Celebrate.showSuccess({ message: '自定义测试消息' });
  assert.ok(true, '自定义消息调用应正常执行');
});

runTest('5.3 showSuccess - 指定图案索引', () => {
  Celebrate.showSuccess({ patternIndex: 0 });
  assert.ok(true, '指定图案索引调用应正常执行');
});

runTest('5.4 showSuccess - 边界图案索引处理', () => {
  // 超出范围的索引应使用默认图案
  Celebrate.showSuccess({ patternIndex: 100 });
  assert.ok(true, '超出范围索引应正常处理');
});

// ========== 测试 6: showSimpleSuccess 验证 ==========
runTest('6.1 showSimpleSuccess - 默认消息', () => {
  Celebrate.showSimpleSuccess();
  assert.ok(true, '默认消息调用应正常执行');
});

runTest('6.2 showSimpleSuccess - 自定义消息', () => {
  Celebrate.showSimpleSuccess('测试成功！');
  assert.ok(true, '自定义消息调用应正常执行');
});

// ========== 测试 7: showStepSuccess 验证 ==========
runTest('7.1 showStepSuccess - 仅步骤编号', () => {
  Celebrate.showStepSuccess(1);
  assert.ok(true, '仅步骤编号调用应正常执行');
});

runTest('7.2 showStepSuccess - 步骤编号和描述', () => {
  Celebrate.showStepSuccess(5, '点击卖出按钮');
  assert.ok(true, '带描述调用应正常执行');
});

// ========== 测试 8: showError 验证 ==========
runTest('8.1 showError - 错误消息', () => {
  Celebrate.showError('操作失败');
  assert.ok(true, '错误消息调用应正常执行');
});

// ========== 测试 9: showWarning 验证 ==========
runTest('9.1 showWarning - 警告消息', () => {
  Celebrate.showWarning('请注意');
  assert.ok(true, '警告消息调用应正常执行');
});

// ========== 测试 10: showInfo 验证 ==========
runTest('10.1 showInfo - 信息消息', () => {
  Celebrate.showInfo('这是提示信息');
  assert.ok(true, '信息消息调用应正常执行');
});

// ========== 测试 11: showRecordEndMenu 验证 ==========
runTest('11.1 showRecordEndMenu - 返回格式化菜单', () => {
  const menu = Celebrate.showRecordEndMenu(1);

  assert.ok(typeof menu === 'string', '应返回字符串');
  assert.ok(menu.includes('步骤'), '应包含步骤信息');
  assert.ok(menu.includes('[1]'), '应包含选项 1');
  assert.ok(menu.includes('[2]'), '应包含选项 2');
  assert.ok(menu.includes('[3]'), '应包含选项 3');
  assert.ok(menu.includes('[4]'), '应包含选项 4');
  assert.ok(menu.includes('继续录制'), '应包含继续录制选项');
  assert.ok(menu.includes('完成录制'), '应包含完成录制选项');
  assert.ok(menu.includes('回放验证'), '应包含回放验证选项');
  assert.ok(menu.includes('查看摘要'), '应包含查看摘要选项');
});

runTest('11.2 showRecordEndMenu - 不同步骤编号', () => {
  const menu1 = Celebrate.showRecordEndMenu(1);
  const menu5 = Celebrate.showRecordEndMenu(5);

  assert.ok(menu1.includes('步骤 1'), '应显示步骤 1');
  assert.ok(menu5.includes('步骤 5'), '应显示步骤 5');
});

// ========== 测试 12: ANSI 颜色代码格式验证 ==========
runTest('12.1 ANSI 颜色代码 - 正确格式', () => {
  const COLORS = Celebrate.COLORS;

  // ANSI 颜色代码应以 \x1b 开头
  assert.ok(COLORS.reset.includes('\x1b'), 'reset 应为 ANSI 格式');
  assert.ok(COLORS.bright.includes('\x1b'), 'bright 应为 ANSI 格式');
  assert.ok(COLORS.green.includes('\x1b'), 'green 应为 ANSI 格式');
});

// 输出测试报告
console.log('\n========================================');
console.log('  测试报告');
console.log('========================================\n');
console.log(`总计: ${testResults.passed.length + testResults.failed.length} 个测试`);
console.log(`通过: ${testResults.passed.length}`);
console.log(`失败: ${testResults.failed.length}\n`);

if (testResults.failed.length > 0) {
  console.log('失败的测试:');
  testResults.failed.forEach(f => {
    console.log(`  - ${f.name}: ${f.error}`);
  });
}

console.log('\n');

module.exports = testResults;