/**
 * 依赖检查模块
 * 检查外部依赖是否满足，引导用户安装缺失的依赖
 *
 * 用法:
 *   const DependencyChecker = require('./dependency-check');
 *   const checker = new DependencyChecker(appiumTestsDir);
 *   const result = await checker.checkAll();
 */

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DependencyChecker {
  constructor(appiumTestsDir) {
    this.appiumTestsDir = appiumTestsDir;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 执行所有检查
   * @returns {Promise<Object>} 检查结果
   */
  async checkAll() {
    console.log('=== 环境检查 ===\n');

    // 1. 检查 Node.js
    this.checkNodeJS();

    // 2. 检查 Appium 服务
    await this.checkAppiumServer();

    // 3. 检查设备连接
    this.checkDevice();

    // 4. 检查测试目录依赖
    this.checkTestDependencies();

    // 5. 检查/创建内部文件
    this.checkInternalFiles();

    const success = this.errors.length === 0;

    return {
      success,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  /**
   * 检查 Node.js
   */
  checkNodeJS() {
    console.log('[检查] Node.js...');

    try {
      const version = execSync('node --version', { encoding: 'utf8' }).trim();
      console.log(`  ✓ Node.js ${version}`);

      // 检查 npm
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`  ✓ npm ${npmVersion}`);

    } catch (error) {
      this.errors.push({
        type: 'nodejs',
        message: '未检测到 Node.js',
        solution: '请先安装 Node.js: https://nodejs.org\n  安装后重启终端，再执行此技能'
      });
      console.log('  ✗ 未检测到 Node.js');
    }
  }

  /**
   * 检查 Appium 服务
   */
  async checkAppiumServer() {
    console.log('[检查] Appium 服务...');

    const isRunning = await this.checkAppiumStatus();

    if (isRunning) {
      console.log('  ✓ Appium 服务运行中 (127.0.0.1:4723)');
      return;
    }

    // Appium 未运行，检查是否安装
    const isInstalled = this.checkAppiumInstalled();

    if (!isInstalled) {
      this.errors.push({
        type: 'appium',
        message: 'Appium 未安装',
        solution: '请执行以下命令安装:\n' +
                  '  npm install -g appium\n' +
                  '  appium driver install uiautomator2\n' +
                  '然后启动服务: appium'
      });
      console.log('  ✗ Appium 未安装');
    } else {
      this.errors.push({
        type: 'appium',
        message: 'Appium 服务未运行',
        solution: '请启动 Appium 服务:\n' +
                  '  appium\n' +
                  '启动后重新执行此技能'
      });
      console.log('  ✗ Appium 服务未运行');
    }
  }

  /**
   * 检查 Appium 服务状态
   * @returns {Promise<boolean>}
   */
  checkAppiumStatus() {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 4723,
        path: '/status',
        method: 'GET',
        timeout: 5000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.value?.ready || false);
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  /**
   * 检查 Appium 是否安装
   * @returns {boolean}
   */
  checkAppiumInstalled() {
    try {
      execSync('appium --version', { encoding: 'utf8', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查设备连接
   */
  checkDevice() {
    console.log('[检查] 设备连接...');

    const adbPath = this.getAdbPath();

    try {
      const result = execSync(`"${adbPath}" devices`, { encoding: 'utf8', timeout: 10000 });
      const lines = result.split('\n').filter(l => l.includes('\t'));

      if (lines.length > 0) {
        const deviceId = lines[0].split('\t')[0];
        console.log(`  ✓ 已连接设备: ${deviceId}`);
      } else {
        this.errors.push({
          type: 'device',
          message: '未检测到已连接的 Android 设备',
          solution: '请检查:\n' +
                    '  1. USB 线是否连接\n' +
                    '  2. 手机是否开启开发者选项\n' +
                    '  3. 手机是否开启 USB 调试\n' +
                    '  4. 是否授权了 USB 调试\n' +
                    '完成后重新执行此技能'
        });
        console.log('  ✗ 未检测到设备');
      }
    } catch (error) {
      // 检查是否是 ADB 不存在
      if (error.message.includes('not found') || error.message.includes('无法识别')) {
        this.errors.push({
          type: 'adb',
          message: '未找到 ADB 工具',
          solution: '请设置 ANDROID_HOME 环境变量:\n' +
                    '  Windows: setx ANDROID_HOME "你的Android SDK路径"\n' +
                    '  macOS/Linux: export ANDROID_HOME=你的Android SDK路径'
        });
        console.log('  ✗ 未找到 ADB 工具');
      } else {
        this.errors.push({
          type: 'device',
          message: '设备检测失败: ' + error.message,
          solution: '请确保设备已正确连接并开启 USB 调试'
        });
        console.log('  ✗ 设备检测失败');
      }
    }
  }

  /**
   * 获取 ADB 路径
   * @returns {string}
   */
  getAdbPath() {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (androidHome) {
      return path.join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    }
    return 'adb';
  }

  /**
   * 检查测试目录依赖
   */
  checkTestDependencies() {
    console.log('[检查] 测试目录依赖...');

    const packageJsonPath = path.join(this.appiumTestsDir, 'package.json');
    const nodeModulesPath = path.join(this.appiumTestsDir, 'node_modules');
    const webdriverioPath = path.join(nodeModulesPath, 'webdriverio');

    // 检查 webdriverio
    if (fs.existsSync(webdriverioPath)) {
      console.log('  ✓ webdriverio 已安装');
    } else {
      // 检查是否有 package.json
      if (!fs.existsSync(packageJsonPath)) {
        // 创建简单的 package.json
        const minimalPackage = {
          name: 'appium-tests',
          version: '1.0.0',
          description: 'Appium automated tests',
          scripts: {
            test: 'node test-*.js'
          },
          dependencies: {}
        };
        fs.writeFileSync(packageJsonPath, JSON.stringify(minimalPackage, null, 2));
        console.log('  ✓ 已创建 package.json');
      }

      this.warnings.push({
        type: 'webdriverio',
        message: 'webdriverio 模块未安装',
        solution: '请执行以下命令安装:\n' +
                  `  cd ${this.appiumTestsDir}\n` +
                  '  npm install webdriverio'
      });
      console.log('  ⚠ webdriverio 未安装');
    }

    // 检查配置文件
    const configPath = path.join(this.appiumTestsDir, 'config/appium.config.js');
    if (fs.existsSync(configPath)) {
      console.log('  ✓ 配置文件已存在');
    } else {
      this.warnings.push({
        type: 'config',
        message: '配置文件不存在',
        solution: '请创建配置文件并填写 App 信息:\n' +
                  `  ${configPath}`
      });
      console.log('  ⚠ 配置文件不存在');
    }
  }

  /**
   * 检查/创建内部文件
   */
  checkInternalFiles() {
    console.log('[检查] 内部文件...');

    // 检查 pages 目录
    const pagesDir = path.join(this.appiumTestsDir, 'pages');
    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
      console.log('  ✓ 已创建 pages 目录');
    }

    // 检查 driver.js
    const driverPath = path.join(pagesDir, 'driver.js');
    if (!fs.existsSync(driverPath)) {
      // 复制模板
      const templatePath = path.join(__dirname, '../templates/driver.template.js');
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, driverPath);
        console.log('  ✓ 已创建 pages/driver.js');
      } else {
        this.warnings.push({
          type: 'driver',
          message: 'driver.js 模板不存在',
          solution: '请确保技能包完整'
        });
        console.log('  ⚠ driver.js 模板不存在');
      }
    } else {
      console.log('  ✓ driver.js 已存在');
    }
  }

  /**
   * 打印检查结果摘要
   */
  printSummary() {
    console.log('\n=== 检查结果 ===\n');

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✓ 所有检查通过，可以开始录制\n');
      return;
    }

    if (this.errors.length > 0) {
      console.log('❌ 存在以下问题需要解决:\n');
      this.errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err.message}`);
        console.log(`   解决方法:\n   ${err.solution.split('\n').join('\n   ')}\n`);
      });
    }

    if (this.warnings.length > 0) {
      console.log('⚠️ 存在以下警告:\n');
      this.warnings.forEach((warn, i) => {
        console.log(`${i + 1}. ${warn.message}`);
        console.log(`   解决方法:\n   ${warn.solution.split('\n').join('\n   ')}\n`);
      });
    }
  }
}

module.exports = DependencyChecker;