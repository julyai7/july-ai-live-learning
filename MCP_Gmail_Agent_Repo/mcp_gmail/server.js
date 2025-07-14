import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Add startup logging to stderr (won't interfere with JSON-RPC)
console.error('Gmail MCP server starting...');

// Set up proper error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// --- Gmail Auth Setup ---
const tokenPath = '/Users/YOURUSERNAME/Desktop/MCP_Agent/mcp_gmail/token.json';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

async function ensureAuth() {
  console.error(`Looking for token file at: ${tokenPath}`);
  console.error(`Current working directory: ${process.cwd()}`);
  console.error(`Token file exists: ${fs.existsSync(tokenPath)}`);
  
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`No authentication tokens found at ${tokenPath}. Please run: node setup-oauth.js`);
  }
  
  try {
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oauth2Client.setCredentials(tokens);
    
    // Test if tokens are still valid
    await oauth2Client.getAccessToken();
    console.error('Authentication successful');
    
  } catch (error) {
    console.error('Token validation failed:', error.message);
    if (error.message.includes('invalid_grant') || error.message.includes('invalid_token')) {
      throw new Error('Authentication tokens are expired. Please run: node setup-oauth.js');
    }
    throw error;
  }
}

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// --- STDIO JSON-RPC Loop ---
process.stdin.setEncoding('utf-8');
let buffer = '';

console.error('Setting up stdin listener...');

process.stdin.on('data', async (chunk) => {
  console.error(`Received data chunk: ${chunk.length} bytes`);
  buffer += chunk;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    if (line.trim()) {
      console.error(`Processing line: ${line.trim().substring(0, 100)}...`);
      try {
        const request = JSON.parse(line.trim());
        await handleRequest(request);
      } catch (error) {
        console.error('Parse error:', error.message);
      }
    }
  }
});

// --- Tool Implementations ---
async function searchEmails(args) {
  const { query = '', sender = '', dateFrom = '', dateTo = '', maxResults = 10 } = args;
  let searchQuery = '';
  if (query) searchQuery += query + ' ';
  if (sender) searchQuery += `from:${sender} `;
  if (dateFrom) searchQuery += `after:${dateFrom} `;
  if (dateTo) searchQuery += `before:${dateTo} `;
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: searchQuery.trim(),
    maxResults: parseInt(maxResults),
  });
  
  const messages = response.data.messages || [];
  const emailDetails = [];
  
  for (const message of messages) {
    const email = await gmail.users.messages.get({ userId: 'me', id: message.id });
    const headers = email.data.payload.headers;
    emailDetails.push({
      id: message.id,
      threadId: message.threadId,
      subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
      from: headers.find(h => h.name === 'From')?.value || 'Unknown',
      date: headers.find(h => h.name === 'Date')?.value || '',
      snippet: email.data.snippet,
    });
  }
  return emailDetails;
}

async function readEmail(args) {
  const { messageId } = args;
  if (!messageId) throw new Error('Message ID is required');
  
  const response = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const message = response.data;
  const headers = message.payload.headers;
  
  let body = '';
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body = Buffer.from(part.body.data, 'base64').toString();
        break;
      }
    }
  } else if (message.payload.body.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString();
  }
  
  return {
    id: message.id,
    subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
    from: headers.find(h => h.name === 'From')?.value || 'Unknown',
    to: headers.find(h => h.name === 'To')?.value || '',
    date: headers.find(h => h.name === 'Date')?.value || '',
    body,
  };
}

async function sendEmail(args) {
  const { to, subject, body } = args;
  if (!to || !subject || !body) throw new Error('To, subject, and body are required');
  
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    body,
  ].join('\n');
  
  const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
  
  return { id: response.data.id };
}

async function getThread(args) {
  const { threadId } = args;
  if (!threadId) throw new Error('Thread ID is required');
  
  const response = await gmail.users.threads.get({ userId: 'me', id: threadId });
  const thread = response.data;
  const messages = thread.messages || [];
  
  return {
    threadId: thread.id,
    messages: messages.map(message => {
      const headers = message.payload.headers;
      return {
        id: message.id,
        subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
        from: headers.find(h => h.name === 'From')?.value || 'Unknown',
        date: headers.find(h => h.name === 'Date')?.value || '',
        snippet: message.snippet,
      };
    }),
  };
}

async function markRead(args) {
  const { messageIds } = args;
  if (!messageIds || !Array.isArray(messageIds)) throw new Error('Message IDs array is required');
  
  const results = [];
  for (const messageId of messageIds) {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
    results.push(messageId);
  }
  
  return { updated: results.length };
}

async function markUnread(args) {
  const { messageIds } = args;
  if (!messageIds || !Array.isArray(messageIds)) throw new Error('Message IDs array is required');
  
  const results = [];
  for (const messageId of messageIds) {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: ['UNREAD'] },
    });
    results.push(messageId);
  }
  
  return { updated: results.length };
}

async function createDraft(args) {
  const { to, subject, body } = args;
  if (!to || !subject || !body) throw new Error('To, subject, and body are required');
  
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    body,
  ].join('\n');
  
  const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw: encodedMessage } },
  });
  
  return { id: response.data.id };
}

// --- JSON-RPC Handler ---
async function handleRequest(request) {
  console.error(`Received request: ${request.method}`);
  
  if (request.method === 'initialize') {
    console.error('Handling initialize request...');
    try {
      await ensureAuth();
      console.error('Authentication successful');
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'gmail-mcp', version: '1.0.0' }
        }
      };
      console.log(JSON.stringify(response));
      console.error('Sent initialize response');
    } catch (error) {
      console.error('Authentication failed:', error.message);
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -1, message: error.message }
      }));
    }
  } else if (request.method === 'tools/list') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [
          {
            name: 'search_emails',
            description: 'Find emails by query, sender, date range',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                sender: { type: 'string', description: 'Sender email' },
                dateFrom: { type: 'string', description: 'After date (YYYY/MM/DD)' },
                dateTo: { type: 'string', description: 'Before date (YYYY/MM/DD)' },
                maxResults: { type: 'integer', description: 'Max results' }
              },
              additionalProperties: false
            }
          },
          {
            name: 'read_email',
            description: 'Get email content, headers',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: { type: 'string', description: 'Email message ID' }
              },
              required: ['messageId'],
              additionalProperties: false
            }
          },
          {
            name: 'send_email',
            description: 'Compose and send messages',
            inputSchema: {
              type: 'object',
              properties: {
                to: { type: 'string', description: 'Recipient' },
                subject: { type: 'string', description: 'Subject' },
                body: { type: 'string', description: 'Body' }
              },
              required: ['to', 'subject', 'body'],
              additionalProperties: false
            }
          },
          {
            name: 'get_thread',
            description: 'Retrieve email conversations',
            inputSchema: {
              type: 'object',
              properties: {
                threadId: { type: 'string', description: 'Thread ID' }
              },
              required: ['threadId'],
              additionalProperties: false
            }
          },
          {
            name: 'mark_read',
            description: 'Mark emails as read',
            inputSchema: {
              type: 'object',
              properties: {
                messageIds: { type: 'array', items: { type: 'string' }, description: 'IDs to mark read' }
              },
              required: ['messageIds'],
              additionalProperties: false
            }
          },
          {
            name: 'mark_unread',
            description: 'Mark emails as unread',
            inputSchema: {
              type: 'object',
              properties: {
                messageIds: { type: 'array', items: { type: 'string' }, description: 'IDs to mark unread' }
              },
              required: ['messageIds'],
              additionalProperties: false
            }
          },
          {
            name: 'create_draft',
            description: 'Save draft emails',
            inputSchema: {
              type: 'object',
              properties: {
                to: { type: 'string', description: 'Recipient' },
                subject: { type: 'string', description: 'Subject' },
                body: { type: 'string', description: 'Body' }
              },
              required: ['to', 'subject', 'body'],
              additionalProperties: false
            }
          }
        ]
      }
    }));
  } else if (request.method === 'tools/call') {
    const toolName = request.params.name;
    const args = request.params.arguments || {};
    try {
      let result;
      if (toolName === 'search_emails') result = await searchEmails(args);
      else if (toolName === 'read_email') result = await readEmail(args);
      else if (toolName === 'send_email') result = await sendEmail(args);
      else if (toolName === 'get_thread') result = await getThread(args);
      else if (toolName === 'mark_read') result = await markRead(args);
      else if (toolName === 'mark_unread') result = await markUnread(args);
      else if (toolName === 'create_draft') result = await createDraft(args);
      else throw new Error(`Unknown tool: ${toolName}`);
      
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }));
    } catch (error) {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -1, message: error.message }
      }));
    }
  }
}

// Signal that server is ready for JSON-RPC
console.error('Gmail MCP server ready for connections');