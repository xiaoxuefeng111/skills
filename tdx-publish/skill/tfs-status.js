const { NtlmClient } = require('axios-ntlm');

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

async function getStatus() {
  for (const url of urls) {
    try {
      const response = await ntlmClient.get(url);
      const data = response.data;
      console.log(`STATUS:${data.status}`);
      console.log(`RESULT:${data.result || 'none'}`);
      console.log(`BUILD_NUMBER:${data.buildNumber}`);
      console.log(`BRANCH:${data.sourceBranch}`);
      if (data.status === 'completed') {
        console.log(`---COMPLETED---`);
      } else {
        console.log(`---IN_PROGRESS---`);
      }
      return;
    } catch (e) {
      console.log(`ERROR:${e.message}`);
    }
  }
  console.log(`---FAILED---`);
}

getStatus().catch(e => console.error(e));