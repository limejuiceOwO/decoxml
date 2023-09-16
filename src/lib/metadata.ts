import { XMLElement } from './base';

const XML_MD_KEY = 'decoxml-metadata';

export type PrimitiveType = 'string' | 'boolean' | 'number';
export type AttrNameGeneratorDef = (propName: string) => string;
export type ValidatorDef = (propValue: unknown) => void;

export interface ValueConverterDef {
  toProp: (attrValue: string) => unknown;
  toAttr: (propValue: unknown) => string;
}

export interface AttrDef {
  prop: string;
  defined: boolean;
  name?: string;
  typ?: PrimitiveType | Record<string, number | string>;
  required?: boolean;
  converter?: ValueConverterDef;
  validator?: ValidatorDef;
  ns?: string;
  nsURI?: string;
}

export interface ChildDef {
  prop: string;
  clazz?: typeof XMLElement;
  minOccur?: number;
  maxOccur?: number | 'unlimited';
}

export interface TextValueDef {
  prop: string;
  required: boolean;
}

export interface XMLMetadata {
  name?: string;
  tag?: string;
  ns?: string;
  attrs: Record<string, AttrDef>;
  children: Record<string, ChildDef>;
  text?: TextValueDef;
  attrNameGen?: AttrNameGeneratorDef;
  nsURI?: string;
  readyFunc?: () => void;
  rawOutput?: boolean;
}

export function getMetadata(target: unknown): XMLMetadata {
  return (
    Reflect.getOwnMetadata(XML_MD_KEY, target) || { attrs: {}, children: {} }
  );
}

export function getOrCreateMetadata(target: unknown): XMLMetadata {
  let md: XMLMetadata = Reflect.getOwnMetadata(XML_MD_KEY, target);
  if (!md) {
    md = {
      attrs: {},
      children: {},
    };
    Reflect.defineMetadata(XML_MD_KEY, md, target);
  }
  return md;
}
