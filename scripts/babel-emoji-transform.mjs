import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import babel from '@babel/core';
import babelPresetReact from '@babel/preset-react';
import babelPluginSyntaxJsx from '@babel/plugin-syntax-jsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsCode = fs.readFileSync(path.join(__dirname, '../src/renderer/components/Icons.jsx'), 'utf8');
const iconMapMatch = iconsCode.match(/const ICON_MAP = {([^}]+)}/s);
const validEmojis = new Set();
if (iconMapMatch) {
  const lines = iconMapMatch[1].split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*['"](.+?)['"]:/);
    if (match) validEmojis.add(match[1]);
  }
}

const emojisRegexStr = Array.from(validEmojis)
  .map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const emojiRegex = new RegExp(`(${emojisRegexStr})`, 'g');

const componentsDir = path.join(__dirname, '../src/renderer/components');

function transformFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  if (!emojiRegex.test(code)) return;
  emojiRegex.lastIndex = 0;

  const out = babel.transformSync(code, {
    filename: filePath,
    presets: [babelPresetReact],
    plugins: [
      babelPluginSyntaxJsx,
      function({ types: t }) {
        let hasEmoji = false;
        let hasImport = false;
        return {
          visitor: {
            Program: {
              enter(path) {
                path.traverse({
                  ImportDeclaration(importPath) {
                    if (importPath.node.source.value.endsWith('Icons')) {
                      if (importPath.node.specifiers.some(s => s.local.name === 'Emoji')) {
                        hasImport = true;
                      }
                    }
                  }
                });
              },
              exit(path) {
                if (hasEmoji && !hasImport) {
                  let iconsImportPath = null;
                  path.traverse({
                    ImportDeclaration(importPath) {
                      if (importPath.node.source.value.endsWith('Icons')) {
                        iconsImportPath = importPath;
                      }
                    }
                  });

                  if (iconsImportPath) {
                    iconsImportPath.node.specifiers.push(
                      t.importSpecifier(t.identifier('Emoji'), t.identifier('Emoji'))
                    );
                  } else {
                    const imp = t.importDeclaration(
                      [t.importSpecifier(t.identifier('Emoji'), t.identifier('Emoji'))],
                      t.stringLiteral('./Icons')
                    );
                    path.unshiftContainer('body', imp);
                  }
                }
              }
            },
            JSXText(path) {
              const text = path.node.value;
              if (emojiRegex.test(text)) {
                hasEmoji = true;
                const parts = text.split(new RegExp(`(${emojisRegexStr})`));
                const nodes = [];
                for (const part of parts) {
                  if (validEmojis.has(part)) {
                    const jsxElement = t.jsxElement(
                      t.jsxOpeningElement(t.jsxIdentifier('Emoji'), [
                        t.jsxAttribute(t.jsxIdentifier('emoji'), t.stringLiteral(part))
                      ], true),
                      null,
                      [],
                      true
                    );
                    nodes.push(jsxElement);
                  } else if (part) {
                    nodes.push(t.jsxText(part));
                  }
                }
                path.replaceWithMultiple(nodes);
              }
            }
          }
        };
      }
    ],
    generatorOpts: {
      retainLines: false, // Don't retain lines because babel formatting is better without it
    }
  });

  if (out && out.code && out.code !== code) {
    fs.writeFileSync(filePath, out.code, 'utf8');
    console.log(`Babel transformed ${path.basename(filePath)}`);
  }
}

const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.jsx') && f !== 'Icons.jsx');
files.forEach(f => {
  try {
    transformFile(path.join(componentsDir, f));
  } catch (err) {
    console.error(`Error processing ${f}:`, err);
  }
});
