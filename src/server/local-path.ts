import ts from 'typescript';
import type { TraceLocation } from './types.js';

// This is an explanation layer for an existing detector finding, not an additional scanner.
// Only direct request properties and simple local string propagation are reconstructed.
export function reconstructLocalPath(
  content: string,
  path: string,
  sinkLine: number,
): TraceLocation[] {
  const file = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const candidates: ts.CallExpression[] = [];
  function find(node: ts.Node) {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    if (ts.isCallExpression(node) && line === sinkLine) candidates.push(node);
    ts.forEachChild(node, find);
  }
  find(file);
  // Multiple calls on a line cannot be anchored reliably with line-only evidence.
  const sink = candidates.length === 1 ? candidates[0] : undefined;
  if (!sink || !sink.arguments.length) return [];
  let scope: ts.Node | undefined = sink.parent;
  while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
  if (!scope) return [];
  const variables = new Map<string, ts.VariableDeclaration[]>();
  const modified = new Set<string>();
  function collect(node: ts.Node) {
    if (node !== scope && ts.isFunctionLike(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const definitions = variables.get(node.name.text) || [];
      definitions.push(node);
      variables.set(node.name.text, definitions);
    }
    if (
      ts.isBinaryExpression(node) &&
      ts.isIdentifier(node.left) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      modified.add(node.left.text);
    if (
      (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
      ts.isIdentifier(node.operand)
    )
      modified.add(node.operand.text);
    ts.forEachChild(node, collect);
  }
  collect(scope);
  const seen = new Set<string>();
  const location = (node: ts.Node): TraceLocation => ({
    line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    content: node.getText(file).slice(0, 500),
  });
  function follow(node: ts.Expression, depth: number): TraceLocation[] {
    if (depth > 6) return [];
    if (ts.isParenthesizedExpression(node)) return follow(node.expression, depth + 1);
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      ['query', 'body', 'params'].includes(node.expression.name.text)
    )
      return [location(node)];
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text) || modified.has(node.text)) return [];
      seen.add(node.text);
      const definitions = variables.get(node.text);
      if (definitions?.length !== 1) return [];
      const definition = definitions[0];
      if (!definition.initializer || definition.getStart(file) >= node.getStart(file)) return [];
      const earlier = follow(definition.initializer, depth + 1);
      return earlier.length ? [...earlier, location(definition)] : [];
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
      return [...follow(node.left, depth + 1), ...follow(node.right, depth + 1)];
    if (ts.isTemplateExpression(node))
      return node.templateSpans.flatMap((s) => follow(s.expression, depth + 1));
    return [];
  }
  const result = follow(sink.arguments[0], 0);
  return result
    .filter(
      (step, i) =>
        result.findIndex((other) => step.line === other.line && step.content === other.content) ===
        i,
    )
    .slice(0, 8);
}
