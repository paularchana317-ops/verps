/**
 * GitHub Push Script for VEPRS Repository
 * Usage:
 *   node push-to-github.js <YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>
 *
 * Example:
 *   node push-to-github.js ghp_xxxxxxxxxxxxxxxxxxxx
 */

const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');

async function push() {
  const token = process.argv[2] || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  if (!token) {
    console.error('❌ Error: GitHub Personal Access Token is required.');
    console.log('\nUsage:');
    console.log('  node push-to-github.js <YOUR_GITHUB_TOKEN>\n');
    console.log('To generate a token:');
    console.log('1. Go to https://github.com/settings/tokens?type=beta or https://github.com/settings/tokens (classic)');
    console.log('2. Check "repo" scope (full control of private/public repositories).');
    console.log('3. Copy the token and run: node push-to-github.js <YOUR_TOKEN>\n');
    process.exit(1);
  }

  console.log('🚀 Pushing to https://github.com/paularchana317-ops/verps.git on branch [main]...');

  try {
    const pushResult = await git.push({
      fs,
      http,
      dir: process.cwd(),
      remote: 'origin',
      ref: 'main',
      force: true,
      onAuth: () => ({ username: token, password: '' })
    });

    console.log('✅ Successfully pushed all VEPRS project code to GitHub repository!');
    console.log('🔗 URL: https://github.com/paularchana317-ops/verps');
  } catch (err) {
    console.error('❌ Push failed:', err.message);
  }
}

push();
