import type { PluginObj } from '@babel/core';
import type { NodePath } from '@babel/traverse';
import type * as BabelTypes from '@babel/types';

interface PluginOptions {
  strip?: boolean;
}

export default function stripPreflightPlugin(
  { types: t }: { types: typeof BabelTypes },
): PluginObj {
  return {
    name: 'strip-preflight',
    visitor: {
      Program: {
        exit(programPath, state) {
          const opts = (state.opts ?? {}) as PluginOptions;
          if (!opts.strip) return;

          const importPaths: NodePath<BabelTypes.ImportDeclaration>[] = [];

          // Collect all import declarations from 'react-native-preflight'
          programPath.traverse({
            ImportDeclaration(importPath) {
              if (importPath.node.source.value === 'react-native-preflight') {
                importPaths.push(importPath);
              }
            },
          });

          if (importPaths.length === 0) return;

          // Maps: localName -> importedName for named imports
          const namedBindings = new Map<string, string>();
          // Namespace binding local names
          const namespaceBindings = new Set<string>();

          for (const importPath of importPaths) {
            for (const spec of importPath.node.specifiers) {
              if (t.isImportSpecifier(spec)) {
                const imported = t.isIdentifier(spec.imported)
                  ? spec.imported.name
                  : spec.imported.value;
                namedBindings.set(spec.local.name, imported);
              } else if (t.isImportNamespaceSpecifier(spec)) {
                namespaceBindings.add(spec.local.name);
              }
              // ImportDefaultSpecifier: tracked via scope, no special handling needed
            }
          }

          // Process named scenario bindings
          for (const [localName, importedName] of namedBindings) {
            if (importedName === 'scenario') {
              const binding = programPath.scope.getBinding(localName);
              if (!binding) continue;
              // Copy refs since we mutate the AST during iteration
              const refs = [...binding.referencePaths];
              for (const refPath of refs) {
                const callPath = refPath.parentPath;
                if (!callPath || !callPath.isCallExpression()) continue;
                if (callPath.node.callee !== refPath.node) continue;
                const args = callPath.node.arguments;
                if (args.length < 2) continue;
                const component = args[1]!;
                callPath.replaceWith(component);
              }
            } else if (importedName === 'Preflight') {
              const binding = programPath.scope.getBinding(localName);
              if (!binding) continue;
              const refs = [...binding.referencePaths];
              for (const refPath of refs) {
                const jsxElement = refPath.findParent((p) => p.isJSXElement());
                if (jsxElement) {
                  jsxElement.remove();
                }
              }
            }
          }

          // Process namespace bindings (e.g. import * as pf from '...')
          for (const nsName of namespaceBindings) {
            const binding = programPath.scope.getBinding(nsName);
            if (!binding) continue;
            const refs = [...binding.referencePaths];
            for (const refPath of refs) {
              const parent = refPath.parent;

              // Handle pf.scenario(...) call expressions
              if (
                t.isMemberExpression(parent) &&
                t.isIdentifier(parent.property, { name: 'scenario' }) &&
                !parent.computed
              ) {
                const memberPath = refPath.parentPath!;
                const callPath = memberPath.parentPath;
                if (
                  callPath &&
                  callPath.isCallExpression() &&
                  callPath.node.callee === parent
                ) {
                  const args = callPath.node.arguments;
                  if (args.length >= 2) {
                    const component = args[1]!;
                    callPath.replaceWith(component);
                  }
                }
              }

              // Handle <pf.Preflight /> JSX
              if (
                t.isJSXMemberExpression(parent) &&
                t.isJSXIdentifier(parent.property, { name: 'Preflight' })
              ) {
                const jsxElement = refPath.findParent((p) => p.isJSXElement());
                if (jsxElement) {
                  jsxElement.remove();
                }
              }
            }
          }

          // Re-crawl scope after transforms, then clean up unused imports
          programPath.scope.crawl();

          for (const importPath of importPaths) {
            // importPath may have been removed already
            if (!importPath.node) continue;

            const remaining = importPath.node.specifiers.filter((spec) => {
              const localName = spec.local.name;
              const binding = programPath.scope.getBinding(localName);
              return binding && binding.referenced;
            });

            if (remaining.length === 0) {
              importPath.remove();
            } else {
              importPath.node.specifiers = remaining;
            }
          }
        },
      },
    },
  };
}

module.exports = stripPreflightPlugin;
