import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';

import { CustomParseError } from './errors';
import {
  AttrDef,
  ChildDef,
  getMetadata,
  requireMetadataAndClsName,
  XMLMetadata,
} from './metadata';
import { isNil, mustBeTrue } from './utils';

const dom = new DOMImplementation();
const doc = dom.createDocument(null, null, null);

interface AttrEntry extends AttrDef {
  md: XMLMetadata;
}

/**
 * Base class for a class representing an XML element. All classes processed by the library must extend this class.
 */
export abstract class XMLElement {
  protected nsURI: string;
  protected rawDom: Element;

  private isSerializing = false;

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  constructor(..._args: unknown[]) {}

  /**
   *  Convert this element's DOM subtree into a xmldom Element object.
   *  @param nsDef custom namespace to URI mapping, overrides NS decorator
   */
  public toXmlObject(nsDef?: Record<string, string>): Element {
    // TODO: add support of reading metadata on super classes
    const { md, clsName } = requireMetadataAndClsName(
      Object.getPrototypeOf(this)
    );

    mustBeTrue(
      this instanceof XMLElement,
      `${clsName}: not an XMLElement instance`
    );

    mustBeTrue(!this.isSerializing, `${clsName}: circular reference detected`);

    try {
      this.isSerializing = true;

      if (md.rawOutput && this.rawDom) {
        return this.rawDom;
      }

      if (!nsDef) {
        nsDef = {};
      }

      const ns = md.ns || '*';
      let nsURI = nsDef[ns] || md.nsURI;
      if (this.nsURI) {
        nsURI = nsDef[ns] = this.nsURI;
      }

      let elem: Element;
      if (nsURI) {
        elem = doc.createElementNS(nsURI, `${ns}:${md.tag}`);
      } else {
        elem = doc.createElement(md.tag);
      }

      const anyThis = this as Record<string, unknown>;
      for (const attrEntry of this.getAttrList()) {
        mustBeTrue(
          attrEntry.defined,
          `${clsName}.${attrEntry.prop}: @Attr must be defined`
        );

        if (!isNil(anyThis[attrEntry.prop])) {
          let attrName = attrEntry.name;

          if (!attrName) {
            attrName = attrEntry.md.attrNameGen
              ? attrEntry.md.attrNameGen(attrEntry.prop)
              : attrEntry.prop;
          }

          let fieldValue = anyThis[attrEntry.prop];
          if (attrEntry.converter) {
            try {
              fieldValue = attrEntry.converter.toAttr(fieldValue);
            } catch (e) {
              throw new CustomParseError(e);
            }
          }
          const fieldValueStr = fieldValue.toString();

          if (attrEntry.ns) {
            // TODO: look up nsDef mapping first
            if (attrEntry.ns === 'xml') {
              // 'xml' namespace does not need an URI
              elem.setAttribute(`xml:${attrName}`, fieldValueStr);
            } else {
              elem.setAttributeNS(
                attrEntry.nsURI,
                `${attrEntry.ns}:${attrName}`,
                fieldValueStr
              );
            }
          } else {
            elem.setAttribute(attrName, fieldValueStr);
          }
        }
      }

      for (const childDef of this.getChildList()) {
        const rawChildObjs = anyThis[childDef.prop];
        if (isNil(rawChildObjs)) {
          mustBeTrue(
            childDef.minOccur === 0,
            `${clsName}.${childDef.prop}: missing child object`
          );
          continue;
        }

        let childObjs: unknown[];

        if (Array.isArray(rawChildObjs)) {
          mustBeTrue(
            childDef.maxOccur !== 1,
            `${clsName}.${childDef.prop}: maxOccur must not equal to 1 if using array type`
          );
          mustBeTrue(
            childDef.maxOccur === 'unlimited' ||
              childDef.maxOccur >= rawChildObjs.length,
            `${clsName}.${childDef.prop}: too many child objects`
          );
          mustBeTrue(
            childDef.minOccur <= rawChildObjs.length,
            `${clsName}.${childDef.prop}: too few child objects`
          );

          childObjs = rawChildObjs;
        } else if (typeof rawChildObjs === 'object') {
          mustBeTrue(
            childDef.maxOccur === 1,
            `${clsName}.${childDef.prop}: maxOccur must equal to 1 if not using array type`
          );
          childObjs = [rawChildObjs];
        } else {
          throw new Error(
            `${clsName}.${
              childDef.prop
            }: invalid child object type: ${typeof rawChildObjs}`
          );
        }

        for (const childObj of childObjs) {
          const childXmlObj = (childObj as XMLElement).toXmlObject(
            Object.assign({}, nsDef)
          );
          elem.appendChild(childXmlObj);
        }
      }

      const textDef = this.getTextValueDef();
      if (textDef) {
        const textProp = anyThis[textDef.prop];
        if (!isNil(textProp)) {
          mustBeTrue(
            typeof textProp === 'string',
            `${clsName}: text property must be string`
          );

          const textElem = doc.createTextNode(textProp as string);
          elem.appendChild(textElem);
        } else {
          mustBeTrue(!textDef.required, `${clsName}: missing text property`);
        }
      }

      return elem;
    } finally {
      this.isSerializing = false;
    }
  }

  /**
   *  Convert this element's DOM subtree into a xml string.
   *  @param nsDef custom namespace to URI mapping, overrides NS decorator
   */
  public toXml(nsDef?: Record<string, string>) {
    const builder = new XMLSerializer();
    return builder.serializeToString(this.toXmlObject(nsDef));
  }

  /** Get the actual namespace URI of the element. */
  public getNamespaceURI() {
    return this.nsURI;
  }

  /**
   * Set the URI of this element's namespace, takes effect on all elements in this element's DOM subtree.
   * Overrides NS decorator and nsUri mapping in toXmlObject().
   * @param uri namespace URI
   */
  public setNamespaceURI(uri: string) {
    this.nsURI = uri;
  }

  /**
   * Get the raw xmldom Element object corresponding to this element.
   * Only take effect on parsed element.
   */
  public getRawDOM() {
    return this.rawDom;
  }

  /**
   * Set the raw xmldom Element object corresponding to this element.
   * If rawOutput is set on Tag decorator, this element will be converted as-is from the rawDom param, ignoring all metadata defined by decorators.
   * @param rawDom raw xmldom Element object of this element
   */
  public setRawDOM(rawDom: Element) {
    this.rawDom = rawDom;
  }

  // TODO: add support of reading metadata on super classes
  // private getMetadataOnPrototypeChain() {
  //   for (let obj = Object.getPrototypeOf(this); obj !== Object.prototype; obj = Object.getPrototypeOf(obj)) {
  //     const md = getMetadata(obj);
  //     if (md.tag) {
  //       // TODO:  merge metadata on super classes
  //       return md;
  //     }
  //   }

  //   return null;
  // }

  private getChildList() {
    const result: ChildDef[] = [];
    const propSet = new Set<string>();

    for (
      let obj = Object.getPrototypeOf(this);
      obj !== Object.prototype;
      obj = Object.getPrototypeOf(obj)
    ) {
      const md = getMetadata(obj);
      const levelResult: ChildDef[] = [];
      for (const childDef of Object.values(md.children)) {
        if (propSet.has(childDef.prop)) {
          // the same property in a child class has been associated with a child, super class definition is overrided
          continue;
        }
        propSet.add(childDef.prop);
        levelResult.push(childDef);
      }
      result.unshift(...levelResult);
    }

    return result;
  }

  private getAttrList() {
    const result: AttrEntry[] = [];
    const propSet = new Set<string>();

    for (
      let obj = Object.getPrototypeOf(this);
      obj !== Object.prototype;
      obj = Object.getPrototypeOf(obj)
    ) {
      const md = getMetadata(obj);
      for (const attrDef of Object.values(md.attrs)) {
        if (propSet.has(attrDef.prop)) {
          // the same property in a child class has been associated with an attribute, super class definition is overrided
          continue;
        }
        propSet.add(attrDef.prop);
        result.push({
          ...attrDef,
          md,
        });
      }
    }

    return result;
  }

  private getTextValueDef() {
    for (
      let obj = Object.getPrototypeOf(this);
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
}
