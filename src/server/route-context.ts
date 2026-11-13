import ts from 'typescript';
import { posix } from 'node:path';
import type { Finding, Snapshot, SourceFile } from '../shared/types.js';
import type { RouteContext } from './route-context-types.js';
import { fileEvidence } from './inventory.js';

// Static navigation for the supported Express/CommonJS subset. Never execute input.
export function routeContexts(snapshot: Snapshot): RouteContext[] {
  const sources = snapshot.files.filter((f) => /\.[cm]?[jt]s$/.test(f.path));
  const parsed = new Map(
    sources.map((file) => [
      file.path,
      ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true),
    ]),
  );
  function resolveReference(expression: ts.Expression, owner: SourceFile) {
    if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression))
      return;
    const unit = parsed.get(owner.path)!;
    let modulePath: string | undefined;
    unit.forEachChild((statement) => {
      if (!ts.isVariableStatement(statement)) return;
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (
          declaration.name.getText(unit) !== expression.expression.getText(unit) ||
          !init ||
          !ts.isCallExpression(init) ||
          init.expression.getText(unit) !== 'require' ||
          !init.arguments[0] ||
          !ts.isStringLiteral(init.arguments[0])
        )
          continue;
        const value = init.arguments[0].text;
        if (value.startsWith('.'))
          modulePath = posix.normalize(posix.join(posix.dirname(owner.path), value));
      }
    });
    if (!modulePath) return;
    const file = sources.find((f) =>
      [modulePath, `${modulePath}.js`, `${modulePath}.ts`, `${modulePath}/index.js`].includes(
        f.path,
      ),
    );
    if (!file) return;
    const target = parsed.get(file.path)!;
    let found: ts.FunctionExpression | ts.ArrowFunction | undefined;
    target.forEachChild((statement) => {
      if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression))
        return;
      const assignment = statement.expression;
      if (
        assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        assignment.left.getText(target) === `exports.${expression.name.text}` &&
        (ts.isFunctionExpression(assignment.right) || ts.isArrowFunction(assignment.right))
      )
        found = assignment.right;
    });
    return found
      ? { file, unit: target, node: found as ts.FunctionExpression | ts.ArrowFunction }
      : undefined;
  }
  const contexts: RouteContext[] = [];
  for (const file of sources) {
    const unit = parsed.get(file.path)!;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        /^(get|post|put|patch|delete)$/.test(node.expression.name.text) &&
        node.arguments.length >= 2 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const handler = resolveReference(node.arguments[node.arguments.length - 1], file);
        if (handler) {
          const middleware = node.arguments.slice(1, -1);
          const sessionChecks = middleware.flatMap((argument) => {
            const resolved = resolveReference(argument, file);
            if (!resolved || !sessionGate(resolved.node, resolved.unit)) return [];
            return [location(resolved.file, resolved.unit, resolved.node, snapshot)];
          });
          contexts.push({
            method: node.expression.name.text.toUpperCase(),
            route: node.arguments[0].text,
            handler: {
              path: handler.file.path,
              line: handler.unit.getLineAndCharacterOfPosition(handler.node.getStart()).line + 1,
              endLine: handler.unit.getLineAndCharacterOfPosition(handler.node.end).line + 1,
            },
            middleware: middleware.map((arg) => arg.getText(unit)),
            registration: location(file, unit, node, snapshot),
            sessionChecks,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(unit);
  }
  return contexts.slice(0, 40);
}

function location(file: SourceFile, unit: ts.SourceFile, node: ts.Node, snapshot: Snapshot) {
  return fileEvidence(
    snapshot,
    file,
    unit.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    unit.getLineAndCharacterOfPosition(node.end).line + 1,
  );
}

function sessionGate(node: ts.FunctionExpression | ts.ArrowFunction, unit: ts.SourceFile) {
  if (!ts.isBlock(node.body) || node.parameters.length < 3) return false;
  const statements = node.body.statements;
  if (statements.length !== 1 || !ts.isIfStatement(statements[0])) return false;
  const branch = statements[0];
  const request = node.parameters[0].name.getText(unit);
  const response = node.parameters[1].name.getText(unit);
  const next = node.parameters[2].name.getText(unit);
  const condition = branch.expression;
  if (
    !ts.isBinaryExpression(condition) ||
    condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
    !ts.isPropertyAccessExpression(condition.left) ||
    condition.left.expression.getText(unit) !== `${request}.session` ||
    !['true', '1'].includes(condition.right.getText(unit))
  )
    return false;
  function singleCall(statement: ts.Statement | undefined) {
    if (!statement) return;
    if (ts.isBlock(statement)) {
      if (statement.statements.length !== 1) return;
      statement = statement.statements[0];
    }
    const expression =
      ts.isReturnStatement(statement) || ts.isExpressionStatement(statement)
        ? statement.expression
        : undefined;
    return expression && ts.isCallExpression(expression) ? expression : undefined;
  }
  const permits = singleCall(branch.thenStatement);
  const denies = singleCall(branch.elseStatement);
  return (
    !!permits &&
    permits.expression.getText(unit) === next &&
    !!denies &&
    ts.isPropertyAccessExpression(denies.expression) &&
    denies.expression.expression.getText(unit) === response &&
    permits.arguments.length === 0 &&
    /^(redirect|send|end)$/.test(denies.expression.name.text)
  );
}

export function applyRouteContext(finding: Finding, contexts: RouteContext[]) {
  const matched = contexts.filter(
    (route) =>
      route.handler.path === finding.evidence.path &&
      finding.evidence.line >= route.handler.line &&
      finding.evidence.line <= route.handler.endLine,
  );
  if (!matched.length) return;
  finding.routeContext = matched.map(
    ({ method, route, middleware, registration, sessionChecks }) => ({
      method,
      route,
      middleware,
      registration,
      sessionChecks,
    }),
  );
  // Route facts inform review; unresolved aliases and dynamic registrations may expose other paths.
}
