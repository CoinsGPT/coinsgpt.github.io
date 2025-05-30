/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import escapeHtml from 'escape-html';
import type {Node, Parent} from 'unist';
import type {
  MdxjsEsm,
  MdxJsxAttribute,
  MdxJsxTextElement,
} from 'mdast-util-mdx';
import type {TOCHeading, TOCItem, TOCItems, TOCSlice} from './types';
import type {
  Program,
  SpreadElement,
  ImportDeclaration,
  ImportSpecifier,
} from 'estree';
import type {Heading, PhrasingContent} from 'mdast';

export function getImportDeclarations(program: Program): ImportDeclaration[] {
  return program.body.filter(
    (item): item is ImportDeclaration => item.type === 'ImportDeclaration',
  );
}

export function isMarkdownImport(node: Node): node is ImportDeclaration {
  if (node.type !== 'ImportDeclaration') {
    return false;
  }
  const importPath = (node as ImportDeclaration).source.value;
  return typeof importPath === 'string' && /\.mdx?$/.test(importPath);
}

export function findDefaultImportName(
  importDeclaration: ImportDeclaration,
): string | undefined {
  return importDeclaration.specifiers.find(
    (o: Node) => o.type === 'ImportDefaultSpecifier',
  )?.local.name;
}

export function findNamedImportSpecifier(
  importDeclaration: ImportDeclaration,
  localName: string,
): ImportSpecifier | undefined {
  return importDeclaration?.specifiers.find(
    (specifier): specifier is ImportSpecifier =>
      specifier.type === 'ImportSpecifier' &&
      specifier.local.name === localName,
  );
}

// Before: import Partial from "partial"
// After: import Partial, {toc as __tocPartial} from "partial"
export function addTocSliceImportIfNeeded({
  importDeclaration,
  tocExportName,
  tocSliceImportName,
}: {
  importDeclaration: ImportDeclaration;
  tocExportName: string;
  tocSliceImportName: string;
}): void {
  // We only add the toc slice named import if it doesn't exist already
  if (!findNamedImportSpecifier(importDeclaration, tocSliceImportName)) {
    importDeclaration.specifiers.push({
      type: 'ImportSpecifier',
      imported: {type: 'Identifier', name: tocExportName},
      local: {type: 'Identifier', name: tocSliceImportName},
    });
  }
}

export function isNamedExport(
  node: Node,
  exportName: string,
): node is MdxjsEsm {
  if (node.type !== 'mdxjsEsm') {
    return false;
  }
  const program = (node as MdxjsEsm).data?.estree;
  if (!program) {
    return false;
  }
  if (program.body.length !== 1) {
    return false;
  }
  const exportDeclaration = program.body[0]!;
  if (exportDeclaration.type !== 'ExportNamedDeclaration') {
    return false;
  }
  const variableDeclaration = exportDeclaration.declaration;
  if (variableDeclaration?.type !== 'VariableDeclaration') {
    return false;
  }
  const {id} = variableDeclaration.declarations[0]!;
  if (id.type !== 'Identifier') {
    return false;
  }

  return id.name === exportName;
}

export async function createTOCExportNodeAST({
  tocExportName,
  tocItems,
}: {
  tocExportName: string;
  tocItems: TOCItems;
}): Promise<MdxjsEsm> {
  function createTOCSliceAST(tocSlice: TOCSlice): SpreadElement {
    return {
      type: 'SpreadElement',
      argument: {type: 'Identifier', name: tocSlice.importName},
    };
  }

  async function createTOCHeadingAST({heading}: TOCHeading) {
    const {toString} = await import('mdast-util-to-string');
    const {valueToEstree} = await import('estree-util-value-to-estree');
    const value: TOCItem = {
      value: toHeadingHTMLValue(heading, toString),
      id: heading.data!.id!,
      level: heading.depth,
    };
    return valueToEstree(value);
  }

  async function createTOCItemAST(tocItem: TOCItems[number]) {
    switch (tocItem.type) {
      case 'slice':
        return createTOCSliceAST(tocItem);
      case 'heading':
        return createTOCHeadingAST(tocItem);
      default: {
        throw new Error(`unexpected toc item type`);
      }
    }
  }

  return {
    type: 'mdxjsEsm',
    value: '', // See https://github.com/facebook/docusaurus/pull/9684#discussion_r1457595181
    data: {
      estree: {
        type: 'Program',
        body: [
          {
            type: 'ExportNamedDeclaration',
            declaration: {
              type: 'VariableDeclaration',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: {
                    type: 'Identifier',
                    name: tocExportName,
                  },
                  init: {
                    type: 'ArrayExpression',
                    elements: await Promise.all(tocItems.map(createTOCItemAST)),
                  },
                },
              ],
              kind: 'const',
            },
            specifiers: [],
            source: null,
          },
        ],
        sourceType: 'module',
      },
    },
  };
}

function stringifyChildren(
  node: Parent,
  toString: (param: unknown) => string, // TODO temporary, due to ESM
): string {
  return (node.children as PhrasingContent[])
    .map((item) => toHeadingHTMLValue(item, toString))
    .join('')
    .trim();
}

// TODO This is really a workaround, and not super reliable
// For now we only support serializing tagName, className and content
// Can we implement the TOC with real JSX nodes instead of html strings later?
function mdxJsxTextElementToHtml(
  element: MdxJsxTextElement,
  toString: (param: unknown) => string, // TODO temporary, due to ESM
): string {
  const tag = element.name;

  // See https://github.com/facebook/docusaurus/issues/11003#issuecomment-2733925363
  if (tag === 'img') {
    return '';
  }

  const attributes = element.attributes.filter(
    (child): child is MdxJsxAttribute => child.type === 'mdxJsxAttribute',
  );

  const classAttribute =
    attributes.find((attr) => attr.name === 'className') ??
    attributes.find((attr) => attr.name === 'class');

  const classAttributeString = classAttribute
    ? `class="${escapeHtml(String(classAttribute.value))}"`
    : ``;

  const allAttributes = classAttributeString ? ` ${classAttributeString}` : '';

  const content = stringifyChildren(element, toString);

  return `<${tag}${allAttributes}>${content}</${tag}>`;
}

export function toHeadingHTMLValue(
  node: PhrasingContent | Heading | MdxJsxTextElement,
  toString: (param: unknown) => string, // TODO temporary, due to ESM
): string {
  switch (node.type) {
    case 'mdxJsxTextElement': {
      return mdxJsxTextElementToHtml(node as MdxJsxTextElement, toString);
    }
    case 'text':
      return escapeHtml(node.value);
    case 'heading':
      return stringifyChildren(node, toString);
    case 'inlineCode':
      return `<code>${escapeHtml(node.value)}</code>`;
    case 'emphasis':
      return `<em>${stringifyChildren(node, toString)}</em>`;
    case 'strong':
      return `<strong>${stringifyChildren(node, toString)}</strong>`;
    case 'delete':
      return `<del>${stringifyChildren(node, toString)}</del>`;
    case 'link':
      return stringifyChildren(node, toString);
    default:
      return toString(node);
  }
}
