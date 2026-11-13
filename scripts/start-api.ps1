$ErrorActionPreference = 'Stop'
if (-not $env:CHATGPT_API_KEY_OX_CHALLENGE) {
  $env:CHATGPT_API_KEY_OX_CHALLENGE = [Environment]::GetEnvironmentVariable(
    'CHATGPT_API_KEY_OX_CHALLENGE', 'User')
}
if (-not $env:CHATGPT_API_KEY_OX_CHALLENGE) {
  throw 'Set CHATGPT_API_KEY_OX_CHALLENGE in your process or Windows user environment.'
}
$env:TRACE_AI_PROVIDER = 'openai'
$env:TRACE_WORKER_CONCURRENCY = '1'
if (-not $env:TRACE_API_MAX_REQUESTS) { $env:TRACE_API_MAX_REQUESTS = '72' }
node scripts/start.mjs
exit $LASTEXITCODE
