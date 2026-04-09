const { NtlmClient } = require('axios-ntlm');
const TFS_URL = process.argv[2];
const COLLECTION = process.argv[3];
const PROJECT = process.argv[4];
const USERNAME = process.argv[5];
const PASSWORD = process.argv[6];

let domain = '', username = USERNAME;
if (USERNAME.includes('\\')) { [domain, username] = USERNAME.split('\\'); }

const ntlmClient = NtlmClient({ username, password: PASSWORD, domain, workstation: '' });

const urls = [
  `${TFS_URL}/tfs/${COLLECTION}/${PROJECT}/_apis/build/definitions?api-version=2.0`,
  `${TFS_URL}/tfs/DefaultCollection/${PROJECT}/_apis/build/definitions?api-version=2.0`,
];

async function getDefs() {
  for (const url of urls) {
    try {
      const res = await ntlmClient.get(url);
      if (res.data.value) {
        for (const d of res.data.value) console.log(`${d.id}|${d.name}`);
        return;
      }
    } catch (e) { console.log('尝试失败:', e.message); }
  }
}
getDefs();