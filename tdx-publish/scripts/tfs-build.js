const { NtlmClient } = require('axios-ntlm');

const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];
const DEFINITION_ID = parseInt(process.argv[7]);
const BRANCH = process.argv[8];

let domain = '', username = USERNAME;
if (USERNAME.includes('\\')) {
  const parts = USERNAME.split('\\');
  domain = parts[0];
  username = parts[1];
}

const ntlmClient = NtlmClient({
  username,
  password: PASSWORD,
  domain,
  workstation: ''
});

const buildRequest = {
  definition: {
    id: DEFINITION_ID
  },
  sourceBranch: BRANCH.startsWith('refs/heads/') ? BRANCH : `refs/heads/${BRANCH}`
};

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds?api-version=2.0`,
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds?api-version=4.1`,
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/builds?api-version=5.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/builds?api-version=2.0`,
];

async function triggerBuild() {
  console.log(`触发构建: ${PROJECT}, 分支: ${BRANCH}, 定义ID: ${DEFINITION_ID}`);
  console.log(`请求体: ${JSON.stringify(buildRequest)}`);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`尝试 URL ${i + 1}: ${url}`);
    try {
      const response = await ntlmClient.post(url, buildRequest);
      console.log(`✅ 成功!`);
      console.log(`构建ID: ${response.data.id}`);
      console.log(`构建号: ${response.data.buildNumber}`);
      console.log(`状态: ${response.data.status}`);
      console.log(`分支: ${response.data.sourceBranch}`);
      console.log(`---SUCCESS---`);
      return;
    } catch (e) {
      console.log(`失败: ${e.response?.status || e.message}`);
    }
  }
  console.log(`❌ 所有 URL 都失败`);
  console.log(`---FAILED---`);
}

triggerBuild().catch(e => console.error(e));