/**
 * 步骤解析模块
 * 将用户输入的自然语言步骤列表解析为可执行的操作序列
 *
 * 用法:
 *   const StepParser = require('./step-parser');
 *   const parser = new StepParser();
 *   const steps = parser.parse(userInput);
 */

/**
 * 操作类型定义
 */
const ACTION_TYPES = {
  LAUNCH_APP: 'launch_app',       // 启动应用
  CLICK: 'click',                 // 点击
  INPUT: 'input',                 // 输入
  SWITCH_TAB: 'switch_tab',       // 切换 Tab
  WAIT: 'wait',                   // 等待
  VERIFY: 'verify',               // 验证
  SWIPE: 'swipe',                 // 滑动
  COMPLETE: 'complete'            // 完成
};

/**
 * 关键词模式匹配规则
 */
const PATTERNS = [
  // 启动应用: "启动应用 com.xxx 入口activity是com.xxx.MainActivity"
  {
    type: ACTION_TYPES.LAUNCH_APP,
    patterns: [/启动应用\s+(\S+)\s*(?:入口activity是)?(\S+)?/i],
    extract: (match) => ({
      appPackage: match[1],
      appActivity: match[2] || null
    })
  },
  // 启动应用: "启动 com.xxx"
  {
    type: ACTION_TYPES.LAUNCH_APP,
    patterns: [/启动\s+(\S+)/i],
    extract: (match) => ({
      appPackage: match[1],
      appActivity: null
    })
  },
  // 切换 Tab: "切换到交易 Tab" 或 "切换到行情"（放在点击之前，优先匹配）
  {
    type: ACTION_TYPES.SWITCH_TAB,
    patterns: [/切换到\s+(\S+)\s*(?:Tab)?/i],
    extract: (match) => ({
      tabName: match[1]
    })
  },
  // 输入股票代码: "输入股票代码 508033"（放在通用输入之前）
  {
    type: ACTION_TYPES.INPUT,
    patterns: [/输入股票代码\s+(\S+)/i],
    extract: (match) => ({
      field: '股票代码',
      value: match[1]
    })
  },
  // 输入数量: "输入卖出数量 100"
  {
    type: ACTION_TYPES.INPUT,
    patterns: [/输入(\S+?)数量\s+(\S+)/i],
    extract: (match) => ({
      field: match[1] + '数量',
      value: match[2]
    })
  },
  // 输入: "输入账号 123456" 或 "输入密码 abc"
  {
    type: ACTION_TYPES.INPUT,
    patterns: [/输入(\S+?)\s+(\S+)/i, /输入\s+(\S+)\s+(\S+)/i],
    extract: (match) => ({
      field: match[1],  // 字段名：账号、密码、股票代码等
      value: match[2]   // 输入值
    })
  },
  // 点击: "点击卖出按钮" 或 "点击确定" - 提取目标时去掉"点击"前缀
  {
    type: ACTION_TYPES.CLICK,
    patterns: [/点击\s+(.+)/i],
    extract: (match) => ({
      target: match[1].trim()
    })
  },
  // 等待: "等待 3秒" 或 "等待页面加载"
  {
    type: ACTION_TYPES.WAIT,
    patterns: [/等待\s+(\d+)\s*秒/i, /等待\s+(.+)/i],
    extract: (match) => ({
      duration: match[1] ? parseInt(match[1]) : 2000,
      description: isNaN(parseInt(match[1])) ? match[1] : null
    })
  },
  // 验证: "验证显示成功" 或 "验证 xxx 出现"
  {
    type: ACTION_TYPES.VERIFY,
    patterns: [/验证\s+(.+)/i],
    extract: (match) => ({
      expected: match[1].trim()
    })
  },
  // 滑动: "向上滑动" 或 "向下滑动"
  {
    type: ACTION_TYPES.SWIPE,
    patterns: [/向(上|下|左|右)滑动/i],
    extract: (match) => ({
      direction: match[1]
    })
  },
  // 完成: "完成"
  {
    type: ACTION_TYPES.COMPLETE,
    patterns: [/完成/i],
    extract: () => ({})
  }
];

class StepParser {
  constructor() {
    this.patterns = PATTERNS;
  }

  /**
   * 解析用户输入的步骤列表
   * @param {string} input - 用户输入的步骤文本
   * @returns {Array} 解析后的步骤数组
   */
  parse(input) {
    if (!input || typeof input !== 'string') {
      return [];
    }

    // 按行分割
    const lines = input.split('\n').filter(line => line.trim());

    // 解析每一行
    const steps = lines.map((line, index) => {
      return this.parseLine(line, index + 1);
    }).filter(step => step !== null);

    return steps;
  }

  /**
   * 解析单行步骤
   * @param {string} line - 单行文本
   * @param {number} lineNumber - 行号
   * @returns {Object|null} 解析结果
   */
  parseLine(line, lineNumber) {
    // 移除行号前缀（如 "1. ", "2. " 等）
    const cleanLine = line.replace(/^\d+[\.\、\:\：\s]+/, '').trim();

    if (!cleanLine) {
      return null;
    }

    // 尝试匹配每个模式
    for (const pattern of this.patterns) {
      for (const regex of pattern.patterns) {
        const match = cleanLine.match(regex);
        if (match) {
          const extracted = pattern.extract(match);
          return {
            lineNumber,
            type: pattern.type,
            raw: cleanLine,
            ...extracted
          };
        }
      }
    }

    // 未匹配到任何模式，尝试推断
    return this.inferStep(cleanLine, lineNumber);
  }

  /**
   * 推断步骤类型（用于未匹配的情况）
   * @param {string} line - 行文本
   * @param {number} lineNumber - 行号
   * @returns {Object} 推断结果
   */
  inferStep(line, lineNumber) {
    // 优先检查切换Tab（包含"切换"关键词）
    if (/切换/.test(line)) {
      const tabMatch = line.match(/切换(?:到)?\s*(\S+)/);
      if (tabMatch) {
        return {
          lineNumber,
          type: ACTION_TYPES.SWITCH_TAB,
          raw: line,
          tabName: tabMatch[1].replace(/Tab$/i, '').trim(),
          inferred: true
        };
      }
    }

    // 如果包含"点击"、"按"等关键词，推断为点击操作
    if (/点击|按|触碰|选择/.test(line)) {
      // 提取点击目标 - 优先提取输入框名称等关键信息
      let target = line;

      // 尝试提取更精确的目标
      const patterns = [
        /点击\s*(.+)/,                              // "点击卖出按钮"
        /(.+?)，?\s*点击/,                           // "输入股票，点击一下"
        /(?:界面上会有)?(.{2,10}?)[按钮]?，?点击/   // "界面上会有输入股票，点击"
      ];

      for (const p of patterns) {
        const m = line.match(p);
        if (m) {
          target = m[1].trim();
          // 清理常见无关词
          target = target
            .replace(/一下$/, '')
            .replace(/\d+个字$/, '')
            .replace(/[，,]$/, '')
            .trim();
          if (target.length >= 2) break;
        }
      }

      return {
        lineNumber,
        type: ACTION_TYPES.CLICK,
        raw: line,
        target: target || line,
        inferred: true
      };
    }

    // 如果包含数字但不是明显的输入场景，检查上下文
    if (/\d+/.test(line)) {
      // 检查是否是纯数字输入场景（如"输入 xxx 123"）
      if (/输入|填写|设置/.test(line)) {
        const numbers = line.match(/\d+/);
        const textBeforeNumber = line.substring(0, line.indexOf(numbers[0])).trim();

        return {
          lineNumber,
          type: ACTION_TYPES.INPUT,
          raw: line,
          field: textBeforeNumber.replace(/输入|填写|设置/g, '').trim() || '值',
          value: numbers[0],
          inferred: true
        };
      }

      // 其他包含数字的情况，默认当作点击
      return {
        lineNumber,
        type: ACTION_TYPES.CLICK,
        raw: line,
        target: line,
        inferred: true
      };
    }

    // 默认当作点击操作
    return {
      lineNumber,
      type: ACTION_TYPES.CLICK,
      raw: line,
      target: line,
      inferred: true
    };
  }

  /**
   * 格式化步骤列表（用于展示）
   * @param {Array} steps - 步骤数组
   * @returns {string} 格式化后的字符串
   */
  formatSteps(steps) {
    return steps.map((step, i) => {
      const typeLabel = this.getTypeLabel(step.type);
      let detail = '';

      switch (step.type) {
        case ACTION_TYPES.LAUNCH_APP:
          detail = `${step.appPackage}${step.appActivity ? ' / ' + step.appActivity : ''}`;
          break;
        case ACTION_TYPES.CLICK:
          detail = step.target;
          break;
        case ACTION_TYPES.INPUT:
          detail = `${step.field} = ${step.value}`;
          break;
        case ACTION_TYPES.SWITCH_TAB:
          detail = step.tabName;
          break;
        case ACTION_TYPES.WAIT:
          detail = step.duration ? `${step.duration}秒` : step.description;
          break;
        default:
          detail = step.raw;
      }

      return `[${step.lineNumber}] ${typeLabel}: ${detail}`;
    }).join('\n');
  }

  /**
   * 获取操作类型的中文标签
   * @param {string} type - 操作类型
   * @returns {string} 中文标签
   */
  getTypeLabel(type) {
    const labels = {
      [ACTION_TYPES.LAUNCH_APP]: '启动应用',
      [ACTION_TYPES.CLICK]: '点击',
      [ACTION_TYPES.INPUT]: '输入',
      [ACTION_TYPES.SWITCH_TAB]: '切换Tab',
      [ACTION_TYPES.WAIT]: '等待',
      [ACTION_TYPES.VERIFY]: '验证',
      [ACTION_TYPES.SWIPE]: '滑动',
      [ACTION_TYPES.COMPLETE]: '完成'
    };
    return labels[type] || type;
  }

  /**
   * 验证步骤列表是否有效
   * @param {Array} steps - 步骤数组
   * @returns {Object} 验证结果 { valid: boolean, errors: [] }
   */
  validate(steps) {
    const errors = [];

    if (!steps || steps.length === 0) {
      errors.push('步骤列表为空');
      return { valid: false, errors };
    }

    steps.forEach((step, i) => {
      // 检查必填字段
      switch (step.type) {
        case ACTION_TYPES.LAUNCH_APP:
          if (!step.appPackage) {
            errors.push(`步骤 ${step.lineNumber}: 缺少应用包名`);
          }
          break;
        case ACTION_TYPES.INPUT:
          if (!step.value) {
            errors.push(`步骤 ${step.lineNumber}: 缺少输入值`);
          }
          break;
        case ACTION_TYPES.CLICK:
          if (!step.target) {
            errors.push(`步骤 ${step.lineNumber}: 缺少点击目标`);
          }
          break;
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 提取应用信息（从第一个启动步骤）
   * @param {Array} steps - 步骤数组
   * @returns {Object|null} { appPackage, appActivity }
   */
  extractAppInfo(steps) {
    const launchStep = steps.find(s => s.type === ACTION_TYPES.LAUNCH_APP);
    if (launchStep) {
      return {
        appPackage: launchStep.appPackage,
        appActivity: launchStep.appActivity
      };
    }
    return null;
  }
}

module.exports = StepParser;
module.exports.ACTION_TYPES = ACTION_TYPES;