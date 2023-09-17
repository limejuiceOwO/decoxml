// tslint:disable: no-console
import { DOMParser } from '@xmldom/xmldom';

import { XMLElement } from './base';
import { CustomParseError, CustomValidationError } from './errors';
import { AttrDef, ChildDef, getMetadata } from './metadata';
import { isInvalidStr, mustBeTrue, notNil } from './utils';

interface ChildMapEntry extends ChildDef {
  result: XMLElement[];
}

interface AttrMapEntry extends AttrDef {
  exist: boolean;
}

export function parseXML(rootType: typeof XMLElement, xml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  return parseXMLElement(rootType, doc.documentElement);
}

function parseXMLElement(
  curType: typeof XMLElement,
  node: Element
): XMLElement {
  const md = getMetadata(curType.prototype); // TODO: add support of reading metadata on super classes
  notNil(md.tag, 'Tag must be defined on every node');

  const anyInstance = Object.create(curType.prototype);
  const instance = anyInstance as XMLElement;
  const attrMap = getAttrMap(curType);

  // tslint:disable-next-line: prefer-for-of
  for (let i = 0; i < node.attributes.length; i++) {
    const attrNode = node.attributes[i];
    if (attrNode.prefix === 'xmlns' || attrNode.nodeName === 'xmlns') {
      // this attribute is a namespace definition, leave it to xmldom
      continue;
    }

    const fieldName = attrNode.nodeName.replace(`${attrNode.prefix}:`, ''); // TODO: add support of handling the same attribute under different namespace
    const entry = attrMap[fieldName];
    if (!entry) {
      // console.log(`${md.name}: Unknown attribute "${fieldName}"`);
      continue;
    }

    mustBeTrue(!entry.exist, `${md.name}: Multiple attribute "${fieldName}"`);
    entry.exist = true;

    mustBeTrue(
      entry.defined,
      `${md.name}.${entry.prop}: @Attr must be defined`
    );

    if (entry.converter) {
      try {
        anyInstance[entry.prop] = entry.converter.toProp(attrNode.value);
      } catch (e) {
        throw new CustomParseError(e);
      }
    } else {
      switch (entry.typ) {
        case 'boolean':
          anyInstance[entry.prop] = attrNode.value === 'true';
          break;
        case 'number':
          anyInstance[entry.prop] = parseFloat(attrNode.value);
          break;
        case 'string':
          anyInstance[entry.prop] = attrNode.value;
          break;
        default:
          // enum
          mustBeTrue(
            Object.values(entry.typ).some((x) => x === attrNode.value),
            `${md.name}.${entry.prop}: Unknown enum value ${attrNode.value}`
          );
          anyInstance[entry.prop] = attrNode.value;
      }
    }

    if (entry.validator) {
      for (const validator of entry.validator) {
        try {
          validator(anyInstance[entry.prop]);
        } catch (e) {
          throw new CustomValidationError(e);
        }
      }
    }
  }

  instance.setNamespaceURI(node.namespaceURI);

  const childMap = getChildMap(curType);
  // tslint:disable-next-line: prefer-for-of
  for (let i = 0; i < node.childNodes.length; i++) {
    const chNode = node.childNodes[i];
    if (node.childNodes[i].nodeType === 3) {
      // Text
      continue;
    }

    let [namespace, name] = chNode.nodeName.split(':');
    if (!name) {
      name = namespace;
      namespace = null;
    }
    const entry = childMap[name];
    if (!entry) {
      // console.log(`${md.name}: Unknown node tag "${name}"`);
      continue;
    }
    const chInstance = parseXMLElement(entry.clazz, chNode as Element);
    entry.result.push(chInstance);
  }

  const text = node.textContent.trim();
  const textDef = getTextValueDef(curType);

  if (textDef && !isInvalidStr(text)) {
    anyInstance[textDef.prop] = text;
  } else {
    mustBeTrue(
      !textDef?.required,
      `${md.name}: Required text content not exists`
    );
  }

  for (const [tag, entry] of Object.entries(childMap)) {
    const { result, minOccur, maxOccur, prop } = entry;
    mustBeTrue(
      result.length >= minOccur,
      `${md.name}: Too few child node "${tag}": ${result.length} out of ${minOccur}`
    );
    if (maxOccur !== 'unlimited') {
      mustBeTrue(
        result.length <= maxOccur,
        `${md.name}: Too many child node "${tag}": ${result.length} out of ${maxOccur}`
      );
    }
    if (result.length === 1 && maxOccur === 1) {
      anyInstance[prop] = result[0];
    } else if (result.length > 0) {
      anyInstance[prop] = result;
    }
  }

  Object.values(attrMap).forEach((entry) =>
    mustBeTrue(
      entry.exist || !entry.required,
      `${md.name}: Required attribute "${entry.name}" not exists`
    )
  );

  instance.setRawDOM(node);

  if (md.readyFunc) {
    try {
      md.readyFunc.call(instance);
    } catch (e) {
      throw new CustomValidationError(e);
    }
  }

  return instance;
}

function getChildMap(target: typeof XMLElement) {
  const map: Record<string, ChildMapEntry> = {};

  for (
    let obj = target.prototype;
    obj !== Object.prototype;
    obj = Object.getPrototypeOf(obj)
  ) {
    const md = getMetadata(obj);

    for (const childDef of Object.values(md.children)) {
      const childMd = getMetadata(childDef.clazz.prototype);
      notNil(childMd.tag, 'Tag must be defined on every node');

      if (map[childMd.tag]) {
        // child element already defined on subclasses, super class definition is overrided
        continue;
      }

      map[childMd.tag] = {
        ...childDef,
        result: [],
      };
    }
  }

  return map;
}

function getAttrMap(target: typeof XMLElement) {
  const map: Record<string, AttrMapEntry> = {};

  for (
    let obj = target.prototype;
    obj !== Object.prototype;
    obj = Object.getPrototypeOf(obj)
  ) {
    const md = getMetadata(obj);

    for (const attrDef of Object.values(md.attrs)) {
      let attrName = attrDef.name;

      if (!attrName) {
        attrName = md.attrNameGen ? md.attrNameGen(attrDef.prop) : attrDef.prop;
      }

      if (map[attrName]) {
        // attribute already defined on subclasses, super class definition is overrided
        // TODO: deal with namespace definition on super class
        continue;
      }

      map[attrName] = {
        ...attrDef,
        name: attrName,
        exist: false,
      };
    }
  }

  return map;
}

function getTextValueDef(target: typeof XMLElement) {
  for (
    let obj = target.prototype;
    obj !== Object.prototype;
    obj = Object.getPrototypeOf(obj)
  ) {
    const md = getMetadata(obj);
    if (md.text) {
      return md.text;
    }
  }

  return null;
}
