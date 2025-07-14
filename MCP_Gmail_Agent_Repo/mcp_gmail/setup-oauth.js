#!/usr/bin/env node

// setup-oauth.js - Run this manually to set up Gmail authentication
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

dotenv.config();

const tokenPath = path.join(process.cwd(), 'token.json');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

async function setupAuth() {
  console.log('Setting up Gmail OAuth authentication...\n');
  
  const scopes = ['https://www.googleapis.com/auth/gmail.modify'];
  const authUrl = oauth2Client.generateAuthUrl({ 
    access_type: 'offline', 
    scope: scopes,
    prompt: 'consent'
  });
  
  console.log('1. Visit this URL in your browser:');
  console.log(authUrl);
  console.log('\n2. Grant permissions to your application');
  console.log('3. Copy the authorization code from the page\n');
  
  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout
  });
  
  const code = await new Promise((resolve) => {
    rl.question('Enter the authorization code here: ', (code) => {
      rl.close();
      resolve(code.trim());
    });
  });
  
  try {
    console.log('\nExchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens saved successfully to token.json');
    
    // Test the tokens
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    console.log('\nTesting Gmail API access...');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`✅ Successfully authenticated as: ${profile.data.emailAddress}`);
    console.log(`📧 Total messages: ${profile.data.messagesTotal}`);
    
    console.log('\n🎉 OAuth setup complete! Your MCP server should now work.');
    
  } catch (error) {
    console.error('❌ Error setting up authentication:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.error('The authorization code may be expired or malformed. Please try again.');
    }
    process.exit(1);
  }
}

setupAuth().catch(console.error);