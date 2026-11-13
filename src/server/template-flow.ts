import ts from 'typescript';
import type { Finding, Snapshot, SourceFile } from '../shared/types.js';
import { sourceFinding } from './investigation-evidence.js';

// Conservative direct-flow rule: request property -> literal render locals -> raw EJS variable.
// Expressions, aliases, helper calls and other engines remain with the AI investigator.
export function templateFindings(snapshot: Snapshot): Finding[] {
  const findings: Finding[] = [];
  for (const file of snapshot.files.filter(
    (item) =>
      /\.[cm]?[jt]s$/.test(item.path) &&
      !/(?:^|\/)(?:tests?|__tests__|exploits?|fixtures)\/|\.(?:test|spec)\./i.test(item.path),
  )) {
    const unit = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (findings.length >= 12) return;
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'render' &&
        node.arguments.length >= 2 &&
        ts.isStringLiteral(node.arguments[0]) &&
        ts.isObjectLiteralExpression(node.arguments[1])
      ) {
        const properties = node.arguments[1].properties;
        const names = properties.map((property) => property.name?.getText(unit));
        // Duplicate keys, spreads and computed keys can replace the apparent input value.
        if (
          properties.some(
            (property) => !ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name),
          ) ||
          new Set(names).size !== names.length
        )
          return;
        const handler = enclosingFunction(node);
        const req = handler?.parameters[0]?.name.getText(unit);
        const res = handler?.parameters[1]?.name.getText(unit);
        if (req && res && node.expression.expression.getText(unit) === res) {
          const view = node.arguments[0].text;
          const name = view.endsWith('.ejs') ? view : `${view}.ejs`;
          const templates = snapshot.files.filter(
            (item) => item.path === `views/${name}` || item.path.endsWith(`/views/${name}`),
          );
          if (templates.length === 1) {
            for (const property of node.arguments[1].properties) {
              if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
              const input = property.initializer.getText(unit);
              const fields = input.split('.');
              if (
                fields.length !== 3 ||
                fields[0] !== req ||
                !['query', 'body', 'params'].includes(fields[1]) ||
                !/^\w+$/.test(fields[2])
              )
                continue;
              const template = templates[0];
              const content = template.content.replaceAll('\r\n', '\n');
              const outputs = [...content.matchAll(/<%([%#=_-]?)([\s\S]*?)[_-]?%>/g)]
                .filter(
                  (match) => match[1] === '-' && match[2].trim() === property.name.getText(unit),
                )
                .map((match) => content.slice(0, match.index).split('\n').length - 1);
              for (const index of outputs) {
                if (findings.length >= 12) return;
                const inputLine = unit.getLineAndCharacterOfPosition(property.getStart()).line + 1;
                const finding = sourceFinding(
                  {
                    title: `Reflected XSS through raw EJS output of ${property.name.text}`,
                    severity: 'high',
                    summary: `The handler passes ${input} directly to ${name}, which emits the value as raw HTML. A crafted request may inject markup or script into the rendered page.`,
                    rationale:
                      'Static source links a request property, a literal render-local mapping and a raw EJS variable.',
                    evidence: quote(template, index + 1),
                    path: [
                      {
                        label: 'Request value passed to the template',
                        detail: `${input} is assigned to the render local.`,
                        evidence: quote(file, inputLine),
                      },
                      {
                        label: 'Raw template output',
                        detail: 'EJS raw output places the value in the response.',
                        evidence: quote(template, index + 1),
                      },
                    ],
                    prerequisites: [
                      'The handler is reachable and renders this EJS template.',
                      'Earlier middleware has not constrained or encoded the request value for this output context.',
                    ],
                    limitations: [
                      'Static rule covers direct mappings and raw variable output; custom engine configuration and earlier middleware need review.',
                    ],
                    remediation:
                      'Use context-appropriate escaped output for this value. For navigation targets, validate allowed destinations separately. Add a raw-versus-escaped template regression.',
                  },
                  snapshot,
                  'Trace direct template flow v1',
                );
                finding.rule = 'template-ejs-raw/v1';
                if (!findings.some((item) => item.id === finding.id)) findings.push(finding);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(unit);
  }
  return findings;
}

function quote(file: SourceFile, line: number) {
  return {
    path: file.path,
    line,
    endLine: line,
    quote: file.content.replaceAll('\r\n', '\n').split('\n')[line - 1],
  };
}
function enclosingFunction(
  node: ts.Node,
): ts.FunctionExpression | ts.ArrowFunction | ts.FunctionDeclaration | undefined {
  let parent = node.parent;
  while (parent) {
    if (
      ts.isFunctionExpression(parent) ||
      ts.isArrowFunction(parent) ||
      ts.isFunctionDeclaration(parent)
    )
      return parent;
    parent = parent.parent;
  }
}

export function addTemplateFindings(findings: Finding[], snapshot: Snapshot) {
  for (const candidate of templateFindings(snapshot)) {
    const duplicate = findings.some(
      (finding) =>
        /xss|cross.site|raw.*(?:html|attribute)/i.test(finding.title) &&
        [
          finding.evidence,
          ...finding.path.flatMap((step) => (step.evidence ? [step.evidence] : [])),
        ].some(
          (evidence) =>
            evidence.path === candidate.evidence.path &&
            evidence.line <= candidate.evidence.line &&
            evidence.endLine >= candidate.evidence.line,
        ),
    );
    if (!duplicate) findings.push(candidate);
  }
}
