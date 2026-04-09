const { NtlmClient } = require('axios-ntlm');
const { exec } = require('child_process');

const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];
const BUILD_ID = process.argv[7];

let domain = '', username = USERNAME;
if (USERNAME.includes('\\')) {
  const parts = USERNAME.split('\\');
  domain = parts[0];
  username = parts[1];
}

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds/${BUILD_ID}?api-version=5.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/builds/${BUILD_ID}?api-version=5.0`,
];

// Windows 系统弹框
function showAlert(title, message) {
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show('${message}', '${title}', 'OK', 'Information')
  `;
  exec(`powershell -Command "${script.replace(/\n/g, ' ')}"`, (err) => {
    if (err) console.log('弹框失败:', err.message);
  });
}

async function checkStatus() {
  for (const url of urls) {
    try {
      const response = await ntlmClient.get(url);
      const data = response.data;

      const status = data.status;
      const result = data.result || '进行中';
      const buildNumber = data.buildNumber;
      const branch = data.sourceBranch;

      console.log(`状态: ${status}`);
      console.log(`结果: ${result}`);
      console.log(`构建号: ${buildNumber}`);
      console.log(`分支: ${branch}`);

      if (status === 'completed') {
        const isSuccess = result === 'succeeded';
        const title = isSuccess ? '✅ TFS 构建成功' : '❌ TFS 构建失败';
        const message = `构建号: ${buildNumber}\n分支: ${branch}\n结果: ${result}`;

        console.log(`---COMPLETED---`);
        console.log(`RESULT:${result}`);

        // 弹框提示
        showAlert(title, message);
        return { completed: true, result };
      }

      console.log(`---IN_PROGRESS---`);
      return { completed: false, result: null };
    } catch (e) {
      console.log(`错误: ${e.message}`);
    }
  }
  console.log(`---FAILED---`);
  return { completed: false, result: null };
}

checkStatus().catch(e => console.error(e));