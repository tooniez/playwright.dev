/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

//@ts-check

const Documentation = require('./documentation');
const { toTitleCase, assertionArgument } = require('./generator');
/** @typedef {import('./generator').GeneratorFormatter} GeneratorFormatter */

/**
 * @implements {GeneratorFormatter}
 */
class CSharpFormatter {
  constructor() {
    this.lang = 'csharp';
  }

  /**
   * @param {Documentation.Member} member
   * @returns {import('./generator').FormattedMember[]}
   */
  formatMember(member) {
    let args = [];

    let prefix =`${toTitleCase(member.clazz.varName)}.`;
    if (member.clazz.varName === 'playwrightAssertions') {
      prefix = '';
    } else if (member.clazz.varName.includes('Assertions')) {
      prefix = `Expect(${toTitleCase(assertionArgument(member.clazz))}).`;
    }

    let name = toTitleCase(member.alias);
    let usages = [`${prefix}${name}`];
    let link = `${prefix}${name}`;
    if (member.kind === 'event') {
      usages = [`${prefix}${name} += async (_, ${formatEventHandler(member)}) => {};`];
      link = `${prefix}${name}`;
      name = `event ${name}`;
    }

    let signatures;
    if (member.kind === 'method' ) {
      args = member.argsArray.slice();
      signatures = renderSharpSignatures(args);
      let isGetter = !args.length && !member.async && !!member.type;
      if (member.name.startsWith('as'))
        isGetter = false;

      name = toAsyncTitleCase(member.async, member.alias);
      const usageBase = `${member.async ? 'await ' : ''}${prefix}${name}`;
      usages = [usageBase];
      link = `${prefix}${name}`;

      if (!isGetter) {
        usages = signatures.map(signature => `${usageBase}(${signature});`);
        link += '()';
      }

      if (member.alias.startsWith('RunAnd')) {
        return [
          { name, link, usages, args },
          {
            name: name.replace('RunAnd', ''),
            link: link.replace('RunAnd', ''),
            usages: usages.map(usage => usage.replace('RunAnd', '')),
            args: args.slice(1)
          }
        ];
      }
    }

    return [{ name, link, usages, args, signatures }];
  }

  /**
   * @param {string} text
   */
  formatTemplate(text) {
    return`<${text}>`;
  }

  /**
   * @param {string} args
   * @param {string} ret
   * @param {Documentation.Type} type
   */
  formatFunction(args, ret, type) {
    if (type.args.length === 0 && type.returnType.name === 'Promise')
      return `[Func]<[Task]>`;
    if (type.args.length === 2 && type.args[0].name === 'int?' && type.args[1].name === 'string?' && !type.returnType)
      return 'Action<int?, string?>';
    if (type.args.length !== 1)
      throw new Error('Unsupported number of arguments in function: ' + JSON.stringify(type));
    if (!type.returnType)
      return "[Action]<" + args + ">";
    if (type.returnType.name === 'boolean')
      return "[Func]<" + args + ", bool>";
    if (type.args?.[0].name === 'Locator' && type.returnType.name === 'Promise')
      return `[Func]<[Locator], [Task]>`;
    throw new Error('Unknown C# type for function: ' + JSON.stringify(type));
  }

  /**
   * @param {Documentation.Type} type
   * @param {'in'|'out'} direction
   * @param {Documentation.Member} member
   */
  formatTypeName(type, direction, member) {
    if (member.kind === 'property' && member.name === 'options') {
      const method = member.enclosingMethod;
      return `\`${toTitleCase(method.clazz.varName)}${toTitleCase(method.alias, { omitAsync: true })}Options?\``;
    }
    const optionalSuffix = member.required ? '' : '?';
    const text = type.name;
    switch (text) {
      case 'any': return `[object]${optionalSuffix}`;
      case 'unknown': return `[object]${optionalSuffix}`;
      case 'Array': return direction === 'out' ? `[IReadOnlyList]${optionalSuffix}` : `[IEnumerable]${optionalSuffix}`;
      case 'float': return `[float]${optionalSuffix}`;
      case 'function': {
        switch (fullName(member)) {
          case 'BrowserContext.exposeBinding.callback': return '[Action]<BindingSource, T, [TResult]>';
          case 'BrowserContext.exposeFunction.callback': return '[Action]<T, [TResult]>';
          case 'BrowserContext.waitForEvent.predicate': return '[Func]<T, [bool]>';
          case 'BrowserContext.waitForEvent2.predicate': return '[Func]<T, [bool]>';
          case 'Page.exposeBinding.callback': return '[Action]<BindingSource, T, [TResult]>';
          case 'Page.exposeFunction.callback': return '[Action]<T, [TResult]>';
          case 'Page.waitForEvent.predicate': return '[Func]<T, [bool]>';
          case 'Page.waitForEvent2.predicate': return '[Func]<T, [bool]>';
          case 'Page.addLocatorHandler.handler': return '[Func]<[Task]>';
        }
        throw new Error(`Unknwon C# type for "${fullName(member)}": "${text}"`);
      };
      case 'null': return '[null]';
      case 'Object': {
        // FIXME: generate correct type for accessibility snapshot children.
        if (member.name === 'children') {
          return `[IEnumerable]${optionalSuffix}`;
        }
        switch (fullName(member)) {
          case 'BrowserContext.addCookies.cookies': return '`Cookie`';
          case 'BrowserContext.cookies': return '`BrowserContextCookiesResult`';
          case 'ElementHandle.selectOption.values': return '`SelectOption`';
          case 'Frame.selectOption.values': return '`SelectOption`';
          case 'Page.selectOption.values': return '`SelectOption`';
          case 'Locator.selectOption.values': return '`SelectOption`';
          case 'ElementHandle.setInputFiles.files': return '`FilePayload`';
          case 'FileChooser.setFiles.files': return '`FilePayload`';
          case 'Frame.setInputFiles.files': return '`FilePayload`';
          case 'Page.setInputFiles.files': return '`FilePayload`';
          case 'Locator.setInputFiles.files': return '`FilePayload`';
          case 'Request.headersArray': return '`HttpHeader`';
          case 'Response.headersArray': return '`HttpHeader`';
          case 'ApiResponse.headersArray': return '`HttpHeader`';
        }
        if (!type.templates)
          return `${toTitleCase(member.alias)}${optionalSuffix}`;
        return `[IDictionary]${optionalSuffix}`;
      }
      case 'path': return `[string]${optionalSuffix}`;
      case 'RegExp': return `[Regex]${optionalSuffix}`;
      case 'string': return `[string]${optionalSuffix}`;
      case 'boolean': return `[bool]${optionalSuffix}`;
      // Escape '[' and ']' so that they don't break markdown links like [byte[]](link)
      case 'Buffer': return `[byte]&#91;&#93;${optionalSuffix}`;
      case 'Readable': return `[Stream]${optionalSuffix}`;
      case 'Serializable': return `[object]${optionalSuffix}`;
      case 'URL': return `[string]${optionalSuffix}`;
    }
    return `[${text}]${optionalSuffix}`;
  }

  /**
   * @param {import('./markdown').MarkdownNode} spec
   * @returns {boolean}
   */
  filterComment(spec) {
    return spec.codeLang === this.lang;
  }

  propertyTypeTitle() {
    return 'Type';
  }

  /**
   * @param {string} option
   */
  formatOptionName(option) {
    return option.split('.').map(o => toTitleCase(o)).join('.');
  }

  /**
   * @param {Documentation.Type} type
   * @param {'in'|'out'} direction
   * @param {Documentation.Member} member
   */
  formatUnionType(type, direction, member) {
    if (type.union.length && type.union[0].name === 'null') {
      const extraNullable = member.required ? '?' : '';
      return type.union.slice(1).map(t => this.formatTypeName(t, direction, member)).join(' | ') + extraNullable;
    }
    if (type.union.some(v => v.name.startsWith('"'))) {
      // Keep in sync with microsoft/playwright's utils/doclint/generateDotnetApi.js
      const enumValueOverrides = new Map([
        ['domcontentloaded', 'DOMContentLoaded'],
        ['networkidle', 'NetworkIdle'],
      ]);
      // strip out the quotes
      const sanitizeLiteral = (literal) => {
        return literal.split('-').map(l => {
          const enumValue = l.replace(/[\"]/g, '');
          return enumValueOverrides.get(enumValue) || toTitleCase(enumValue);
        }).join('');
      }
      return `\`enum ${type.name} { ${type.union.map(l => sanitizeLiteral(l.name)).join(', ')} }${member.required ? '' : '?'}\``;
    }
  }
}

/**
 * @param {Documentation.Member} member
 * @returns {string}
 */
function formatEventHandler(member) {
  let name = member.type?.name
    .replace('?', '')
    .replace('string', '')
  if (!name)
    return 'value';
  return name[0].toLowerCase() + name.substring(1);
}

/**
 * @param {Documentation.Member} member
 * @returns {string}
 */
function fullName(member) {
  if (member.enclosingMethod) {
    const method = member.enclosingMethod;
    let fqn = `${toTitleCase(method.clazz.varName)}.${method.name}`;
    if (member.kind === 'property')
      fqn += '.' + member.name;
    return fqn;
  }
  return `${toTitleCase(member.clazz.varName)}.${member.name}`;
}

/**
 * @param {Documentation.Member[]} args
 * @return {string[]}
 */
 function renderSharpSignatures(args) {
  const copy = args.slice();
  copy.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  const argNames = copy.map(a => a.name);
  return [argNames.join(', ')];
}

/**
 * @param {boolean} isAsync
 * @param {string} name
 */
function toAsyncTitleCase(isAsync, name) {
  if (!isAsync || name.endsWith('Async'))
    return toTitleCase(name);
  return toTitleCase(name) + 'Async';
}

module.exports = { CSharpFormatter };
