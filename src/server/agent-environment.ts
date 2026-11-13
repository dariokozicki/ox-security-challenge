export function agentEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set([
    'path',
    'pathext',
    'systemroot',
    'windir',
    'comspec',
    'home',
    'userprofile',
    'homedrive',
    'homepath',
    'appdata',
    'localappdata',
    'programdata',
    'programfiles',
    'programfiles(x86)',
    'temp',
    'tmp',
    'codex_home',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'ssl_cert_file',
    'ssl_cert_dir',
    'node_extra_ca_certs',
  ]);
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => allowed.has(key.toLowerCase())),
  );
}
