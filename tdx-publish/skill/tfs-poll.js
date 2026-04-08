const { NtlmClient } = require('axios-ntlm');
const { exec } = require('child_process');

const TFS_URL = process.argv[2] || 'http://192.168.40.200:8080';
const COLLECTION = process.argv[3] || 'OpenSDK';
const PROJECT = process.argv[4] || 'AppCCGR';
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];
const BUILD_ID = process.argv[7];
const POLL_INTERVAL = parseInt(process.argv[8]) || 30000;

if (!USERNAME || !PASSWORD || !BUILD_ID) {
  console.log('用法: node tfs-poll.js <TFS_URL> <COLLECTION> <PROJECT> <USERNAME> <PASSWORD> <BUILD_ID> [POLL_INTERVAL]');
  console.log('示例: node tfs-poll.js http://192.168.40.200:8080 OpenSDK AppCCGR $TFS_USER $TFS_PASSWORD 55167 30000');
  process.exit(1);
}

let domain = '', username = USERNAME;
if (USERNAME.includes('\\')) {
  const parts = USERNAME.split('\\');
  domain = parts[0];
  username = parts[1];
}

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

// Windows 弹框 (使用 mshta，兼容性最好)
function showAlert(title, message) {
  // 移除换行和特殊字符
  const cleanMsg = message.replace(/[\r\n]/g, ' ').replace(/"/g, "'");
  const cleanTitle = title.replace(/"/g, "'");

  const cmd = `mshta vbscript:Execute("msgbox \\"${cleanMsg}\\",64,\\"${cleanTitle}\\"(window.close)")`;
  exec(cmd, (err) => {
    if (err) console.log('弹框失败:', err.message);
  });
}

// 系统提示音
function beep(success) {
  if (success) {
    exec('powershell -Command "[console]::Beep(1000, 300); [console]::Beep(1500, 300)"', () => {});
  } else {
    exec('powershell -Command "[console]::Beep(300, 500)"', () => {});
  }
}

async function checkStatus() {
  const urls = [
    `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds/${BUILD_ID}?api-version=2.0`,
    `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/builds/${BUILD_ID}?api-version=2.0`,
  ];

  for (const url of urls) {
    try {
      const response = await ntlmClient.get(url);
      return response.data;
    } catch (e) {
      // 继续尝试下一个URL
    }
  }
  return null;
}

async function monitor() {
  console.log('========================================');
  console.log('TFS 构建监控');
  console.log(`构建ID: ${BUILD_ID}`);
  console.log(`工程: ${PROJECT}`);
  console.log(`轮询间隔: ${POLL_INTERVAL / 1000}秒`);
  console.log('========================================\n');

  let startTime = Date.now();
  let lastStatus = '';

  while (true) {
    const data = await checkStatus();

    if (!data) {
      console.log(`[${new Date().toLocaleTimeString()}] 无法获取构建状态，重试中...`);
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const statusStr = `${data.status} | ${data.result || 'running'}`;

    // 只在状态变化时输出
    if (statusStr !== lastStatus) {
      console.log(`[${new Date().toLocaleTimeString()}] ${statusStr} | ${mins}m${secs}s`);
      lastStatus = statusStr;
    }

    if (data.status === 'completed') {
      const isSuccess = data.result === 'succeeded';
      const branchName = (data.sourceBranch || '').replace('refs/heads/', '');

      console.log('\n========================================');
      console.log(isSuccess ? '✅ 构建成功!' : '❌ 构建失败!');
      console.log(`构建号: ${data.buildNumber}`);
      console.log(`分支: ${branchName}`);
      console.log(`结果: ${data.result}`);
      console.log(`用时: ${mins}分${secs}秒`);
      console.log('========================================');

      // 弹框提示
      const title = isSuccess ? 'TFS Build Success' : 'TFS Build Failed';
      const msg = `Build ${data.buildNumber} ${data.result}. Branch: ${branchName}. Time: ${mins}m${secs}s`;
      showAlert(title, msg);

      // 提示音
      beep(isSuccess);

      process.exit(isSuccess ? 0 : 1);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

monitor().catch(e => {
  console.error('监控出错:', e.message);
  process.exit(1);
});