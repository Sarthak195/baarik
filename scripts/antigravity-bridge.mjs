#!/usr/bin/env node
/**
 * Antigravity bridge — drive Google Antigravity agents from the command line.
 *
 * Antigravity ships an `agentapi` subcommand on its language server: a short-lived
 * gRPC client that talks to an already-running IDE instance, prints JSON and exits.
 * Antigravity's own agents use it to message each other, which makes it a supported
 * path for fanning work out across several agents in parallel.
 *
 * The gRPC endpoint is ephemeral — a fresh port and CSRF token per IDE launch — so
 * every command begins by discovering them from the running process. Discovery is
 * cached for the life of one invocation only.
 *
 * Usage:
 *   node scripts/antigravity-bridge.mjs discover
 *   node scripts/antigravity-bridge.mjs new  [--model=pro] "<prompt>"
 *   node scripts/antigravity-bridge.mjs status <conversationId>
 *   node scripts/antigravity-bridge.mjs send <conversationId> "<message>"
 *
 * Requires Antigravity IDE to be running. See docs/adr/0003-antigravity-workflow.md.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const LANGUAGE_SERVERS = [
  'C:/Users/Sarthak/AppData/Local/Programs/Antigravity IDE/resources/app/extensions/antigravity/bin/language_server_windows_x64.exe',
  'C:/Users/Sarthak/AppData/Local/Programs/Antigravity/resources/bin/language_server.exe',
];

/** Prefer the IDE's own binary so client and server versions match. */
function resolveLanguageServer() {
  const found = LANGUAGE_SERVERS.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'Antigravity language server not found. Checked:\n  ' + LANGUAGE_SERVERS.join('\n  '),
    );
  }
  return found;
}

function powershell(script) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

/**
 * Find candidate `{ port, csrfToken }` pairs from running language-server processes.
 *
 * A process exposes several listening ports and only one speaks the agent gRPC
 * service, so every pair is returned and `probe` decides which one answers.
 */
function candidateEndpoints() {
  const raw = powershell(`
    $out = @()
    Get-CimInstance Win32_Process -Filter "Name LIKE '%language_server%'" | ForEach-Object {
      $tok = [regex]::Match($_.CommandLine, '--csrf_token[ =]([0-9a-fA-F-]{36})').Groups[1].Value
      if ($tok) {
        Get-NetTCPConnection -State Listen -OwningProcess $_.ProcessId -ErrorAction SilentlyContinue |
          ForEach-Object { $out += [pscustomobject]@{ port = $_.LocalPort; csrfToken = $tok } }
      }
    }
    $out | ConvertTo-Json -Compress
  `).trim();

  if (!raw || raw === 'null') return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Run an `agentapi` subcommand against a specific endpoint.
 * Errors are returned rather than thrown: the API reports failures as JSON on stdout
 * with a non-zero exit, and the error text is how `probe` tells endpoints apart.
 */
function agentapi(endpoint, args) {
  try {
    const stdout = execFileSync(resolveLanguageServer(), ['agentapi', ...args], {
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        ANTIGRAVITY_LS_ADDRESS: `127.0.0.1:${String(endpoint.port)}`,
        ANTIGRAVITY_CSRF_TOKEN: endpoint.csrfToken,
      },
    });
    return { ok: true, raw: stdout.trim() };
  } catch (error) {
    const raw = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    return { ok: false, raw };
  }
}

/**
 * Identify the endpoint that actually serves the agent API.
 *
 * The signals are cleanly distinguishable: the right port answers a bogus id with
 * "trajectory not found" (handler reached), a wrong token gives "Unauthenticated",
 * and a wrong port fails to read the server preface.
 */
function resolveEndpoint() {
  const candidates = candidateEndpoints();
  if (candidates.length === 0) {
    throw new Error('No Antigravity language server is running. Open Antigravity IDE first.');
  }

  for (const candidate of candidates) {
    const { raw } = agentapi(candidate, ['get-conversation-metadata', '__bridge_probe__']);
    if (raw.includes('trajectory not found')) return candidate;
  }

  throw new Error(
    `Found ${String(candidates.length)} listening port(s) but none served the agent API. ` +
      'Is Antigravity IDE fully started?',
  );
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'help') {
    process.stdout.write(
      [
        'Antigravity bridge',
        '',
        '  discover                      Show the resolved gRPC endpoint',
        '  new [--model=pro] "<prompt>"  Start an agent conversation, print its id',
        '  status <conversationId>       Fetch conversation metadata',
        '  send <conversationId> "<msg>" Send a message into a conversation',
        '',
      ].join('\n'),
    );
    return;
  }

  const endpoint = resolveEndpoint();

  switch (command) {
    case 'discover': {
      printJson({ address: `127.0.0.1:${String(endpoint.port)}`, csrfToken: endpoint.csrfToken });
      return;
    }
    case 'new': {
      const modelArg = rest.find((argument) => argument.startsWith('--model='));
      const prompt = rest.filter((argument) => !argument.startsWith('--')).join(' ');
      if (!prompt) throw new Error('new: a prompt is required');
      const args = ['new-conversation', ...(modelArg ? [modelArg] : []), prompt];
      const result = agentapi(endpoint, args);
      process.stdout.write(`${result.raw}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    case 'status': {
      const [conversationId] = rest;
      if (!conversationId) throw new Error('status: a conversation id is required');
      const result = agentapi(endpoint, ['get-conversation-metadata', conversationId]);
      process.stdout.write(`${result.raw}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    case 'send': {
      const [conversationId, ...messageParts] = rest;
      const message = messageParts.join(' ');
      if (!conversationId || !message) {
        throw new Error('send: a conversation id and a message are required');
      }
      const result = agentapi(endpoint, ['send-message', conversationId, message]);
      process.stdout.write(`${result.raw}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
