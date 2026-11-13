import ts from 'typescript';
import type { SourceFile } from '../shared/types.js';

export function jsonLocator(file: SourceFile) {
  const tree = ts.parseJsonText(file.path, file.content);
  const first = tree.statements[0];
  if (!first || !ts.isExpressionStatement(first)) throw new Error('Invalid JSON syntax tree');
  const root = first.expression;
  return (segments: (string | number)[]) => {
    let node: ts.Expression = root;
    let anchor: ts.Node = root;
    for (const segment of segments) {
      if (typeof segment === 'number' && ts.isArrayLiteralExpression(node)) {
        node = node.elements[segment];
        anchor = node;
      } else if (ts.isObjectLiteralExpression(node)) {
        // JSON.parse resolves duplicate keys to the last declaration.
        const property = node.properties.findLast(
          (p) =>
            ts.isPropertyAssignment(p) && ts.isStringLiteral(p.name) && p.name.text === segment,
        );
        if (!property || !ts.isPropertyAssignment(property))
          throw new Error('Missing JSON location');
        node = property.initializer;
        anchor = property;
      } else throw new Error('Invalid JSON location');
      if (!node) throw new Error('Missing JSON element');
    }
    return tree.getLineAndCharacterOfPosition(anchor.getStart(tree)).line + 1;
  };
}
