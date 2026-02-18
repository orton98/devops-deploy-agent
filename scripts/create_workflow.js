// Create n8n DevOps Deploy Agent workflow via API
const http = require('http');

const N8N_HOST = 'localhost';
const N8N_PORT = 5678;

// First check if n8n is accessible via docker exec
const workflow = {
  name: "DevOps Deploy Agent",
  nodes: [
    {
      id: "webhook-1",
      name: "Deploy Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [200, 400],
      parameters: {
        httpMethod: "POST",
        path: "deploy",
        responseMode: "responseNode",
        options: {}
      }
    },
    {
      id: "validate-1",
      name: "Validate Request",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [400, 400],
      parameters: {
        jsCode: `const body = $input.first().json.body || $input.first().json || {};
const required = ['platform', 'project'];
const missing = required.filter(k => !body[k]);

if (missing.length > 0) {
  return [{ json: { error: 'Missing: ' + missing.join(', '), status: 'validation_failed' }}];
}

const platforms = ['github', 'aws', 'railway', 'cloudflare', 'render', 'digitalocean'];
if (!platforms.includes(body.platform)) {
  return [{ json: { error: 'Invalid platform: ' + body.platform, status: 'validation_failed' }}];
}

return [{ json: { ...body, status: 'validated', timestamp: new Date().toISOString() }}];`
      }
    },
    {
      id: "switch-1",
      name: "Platform Router",
      type: "n8n-nodes-base.switch",
      typeVersion: 3,
      position: [600, 400],
      parameters: {
        mode: "rules",
        rules: {
          values: [
            { conditions: { conditions: [{ leftValue: "={{ $json.platform }}", rightValue: "github", operator: { type: "string", operation: "equals" }}], combinator: "and" }, outputKey: "0" },
            { conditions: { conditions: [{ leftValue: "={{ $json.platform }}", rightValue: "aws", operator: { type: "string", operation: "equals" }}], combinator: "and" }, outputKey: "1" },
            { conditions: { conditions: [{ leftValue: "={{ $json.platform }}", rightValue: "railway", operator: { type: "string", operation: "equals" }}], combinator: "and" }, outputKey: "2" },
            { conditions: { conditions: [{ leftValue: "={{ $json.platform }}", rightValue: "cloudflare", operator: { type: "string", operation: "equals" }}], combinator: "and" }, outputKey: "3" },
            { conditions: { conditions: [{ leftValue: "={{ $json.platform }}", rightValue: "render", operator: { type: "string", operation: "equals" }}], combinator: "and" }, outputKey: "4" },
            { conditions: { conditions: [{ leftValue: "={{ $json.platform }}", rightValue: "digitalocean", operator: { type: "string", operation: "equals" }}], combinator: "and" }, outputKey: "5" }
          ]
        }
      }
    },
    {
      id: "respond-1",
      name: "Respond to Client",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1,
      position: [900, 400],
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ success: true, deploymentId: $json.deploymentId || ('dep-' + Date.now()), platform: $json.platform, project: $json.project, status: 'initiated', message: 'Deployment to ' + $json.platform + ' started successfully', timestamp: new Date().toISOString() }) }}`,
        options: { responseCode: 200 }
      }
    }
  ],
  connections: {
    "Deploy Webhook": { main: [[{ node: "Validate Request", type: "main", index: 0 }]] },
    "Validate Request": { main: [[{ node: "Platform Router", type: "main", index: 0 }]] },
    "Platform Router": { main: [
      [{ node: "Respond to Client", type: "main", index: 0 }],
      [{ node: "Respond to Client", type: "main", index: 0 }],
      [{ node: "Respond to Client", type: "main", index: 0 }],
      [{ node: "Respond to Client", type: "main", index: 0 }],
      [{ node: "Respond to Client", type: "main", index: 0 }],
      [{ node: "Respond to Client", type: "main", index: 0 }]
    ]}
  },
  settings: { executionOrder: "v1" }
};

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch(e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function createWorkflow() {
  console.log('🔧 Creating n8n DevOps Deploy Agent workflow...');
  
  const payload = JSON.stringify(workflow);
  
  try {
    // Try without API key first (n8n may not require it in basic mode)
    const result = await makeRequest({
      hostname: N8N_HOST,
      port: N8N_PORT,
      path: '/api/v1/workflows',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, payload);
    
    if (result.status === 200 || result.status === 201) {
      const wid = result.data.id;
      console.log(`✅ Workflow created! ID: ${wid}`);
      
      // Activate it
      try {
        const activateResult = await makeRequest({
          hostname: N8N_HOST,
          port: N8N_PORT,
          path: `/api/v1/workflows/${wid}/activate`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': 2 }
        }, '{}');
        console.log(`🚀 Workflow activated! Status: ${activateResult.status}`);
      } catch(e) {
        console.log('⚠️  Could not activate (may need manual activation in n8n UI)');
      }
      
      console.log(`\n🔗 Webhook URL: http://localhost/webhook/deploy`);
      console.log(`🔗 n8n UI: http://localhost/n8n`);
    } else if (result.status === 401) {
      console.log('⚠️  n8n requires authentication.');
      console.log('   Please visit http://localhost/n8n to set up your account,');
      console.log('   then run: node scripts/create_workflow.js');
      console.log('\n   Or import the workflow manually from: scripts/workflow.json');
    } else {
      console.log(`⚠️  Response ${result.status}:`, JSON.stringify(result.data).substring(0, 200));
    }
  } catch(e) {
    console.log(`❌ Could not connect to n8n: ${e.message}`);
    console.log('   Make sure n8n container is running: docker compose ps');
  }
}

createWorkflow();
