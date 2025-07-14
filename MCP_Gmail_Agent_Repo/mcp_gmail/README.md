# Gmail MCP Server

A Model Context Protocol (MCP) server that provides Gmail integration capabilities, allowing you to search, read, send, and manage emails through Claude's interface.

## Features

- **search_emails** - Find emails by query, sender, date range
- **read_email** - Get email content, attachments, headers
- **send_email** - Compose and send messages
- **get_thread** - Retrieve email conversations
- **mark_read/unread** - Update email status
- **create_draft** - Save draft emails

## Setup Instructions

### 1. Install Dependencies

```bash
cd mcp_gmail
npm install
```

### 2. Google API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Desktop application" as the application type
   - Download the credentials JSON file

### 3. Environment Configuration

1. Copy the environment example file:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and add your Google API credentials:
   ```
   GOOGLE_CLIENT_ID=your_client_id_from_google_console
   GOOGLE_CLIENT_SECRET=your_client_secret_from_google_console
   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
   ```

### 4. OAuth Authentication

The first time you run the server, you'll need to authenticate with Google:

1. Run the server:
   ```bash
   npm start
   ```

2. The server will provide a URL for OAuth authentication
3. Open the URL in your browser and authorize the application
4. Copy the authorization code and paste it back to the server
5. The server will save the tokens for future use

## Usage Examples

### Search Emails
```json
{
  "name": "search_emails",
  "arguments": {
    "query": "meeting",
    "sender": "colleague@company.com",
    "dateFrom": "2024/01/01",
    "maxResults": 5
  }
}
```

### Read Email
```json
{
  "name": "read_email",
  "arguments": {
    "messageId": "18c1a2b3d4e5f6g7h8i9j0"
  }
}
```

### Send Email
```json
{
  "name": "send_email",
  "arguments": {
    "to": "recipient@example.com",
    "subject": "Test Email",
    "body": "This is a test email sent via MCP server."
  }
}
```

### Get Email Thread
```json
{
  "name": "get_thread",
  "arguments": {
    "threadId": "18c1a2b3d4e5f6g7h8i9j0"
  }
}
```

### Mark Emails as Read
```json
{
  "name": "mark_read",
  "arguments": {
    "messageIds": ["18c1a2b3d4e5f6g7h8i9j0", "18c1a2b3d4e5f6g7h8i9j1"]
  }
}
```

### Create Draft
```json
{
  "name": "create_draft",
  "arguments": {
    "to": "recipient@example.com",
    "subject": "Draft Email",
    "body": "This is a draft email."
  }
}
```

## Integration with Claude

To use this MCP server with Claude:

1. Configure your MCP client to include this server
2. The server will be available as tools that Claude can call
3. Claude will be able to perform all Gmail operations through the defined tools

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- The OAuth tokens are stored locally and should be protected
- Only grant the minimum necessary permissions to the Google API

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Make sure your Google API credentials are correct and the Gmail API is enabled
2. **Permission Denied**: Ensure you've granted the necessary permissions during OAuth flow
3. **Token Expired**: Delete the `token.json` file and re-authenticate

### Debug Mode

Run the server in debug mode for more detailed logs:
```bash
DEBUG=* npm start
```

## License

MIT License - see LICENSE file for details. 