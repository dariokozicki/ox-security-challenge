const source =
  /\.(?:[cm]?js|jsx|tsx?|php|py|rb|go|rs|java|kt|kts|cs|c|cc|cpp|h|hpp|swift|scala|sh)$/i;
const template = /\.(?:ejs|hbs|handlebars|mustache|pug|dust|html?|vue|svelte|erb|jinja2?|twig)$/i;
const metadataNames = new Set([
  'package.json',
  'package-lock.json',
  'composer.json',
  'composer.lock',
  'go.mod',
  'go.sum',
  'Cargo.toml',
  'Cargo.lock',
  'Gemfile',
  'Gemfile.lock',
  'pom.xml',
  'packages.lock.json',
  'pyproject.toml',
  'poetry.lock',
  'uv.lock',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bom.json',
  'php.ini',
  '.tool-versions',
  '.python-version',
  '.node-version',
]);
export const isSource = (path: string) => source.test(path) || template.test(path);
export const isMetadata = (path: string) => {
  const name = path.split('/').at(-1) || '';
  return (
    metadataNames.has(name) ||
    /^requirements[^/]*\.txt$/.test(name) ||
    /^Dockerfile[^/]*$/.test(name) ||
    /\.(?:Dockerfile|cdx\.json)$/.test(name)
  );
};
export const selectedFile = (path: string) => isSource(path) || isMetadata(path);

export const intakeLimit = (path: string) => (isMetadata(path) ? 1_500_000 : 200_000);
export const sourcePriority = (path: string) =>
  /(^|\/)(exploits?|tests?|examples?|fixtures?|__tests__)\//i.test(path)
    ? 2
    : /(^|\/)(public|static|assets)\//i.test(path)
      ? 1
      : 0;
