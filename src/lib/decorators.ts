/* eslint-disable @typescript-eslint/no-unused-vars */
import { XMLElement } from './base';
import {
  AttrNameGeneratorDef,
  getOrCreateMetadata,
  PrimitiveType,
  ValidatorDef,
  ValueConverterDef,
  XMLMetadata,
} from './metadata';
import 'reflect-metadata';
import { mustBeTrue } from './utils';

interface Ctor {
  name: string;
  prototype: unknown;
}

/**
 * Links a XML tag schema with a XMLElement subclass.
 * The link cannot be inherited, so it must be defined on every leaf subclass.
 * @param name name of the tag
 * @param option.rawOutput refer to XMLElement.setRawDOM()
 */
export function NamedTag(
  name: string,
  option?: {
    rawOutput?: boolean;
  }
) {
  const { rawOutput = false } = option || {};
  return (target: Ctor) => {
    const md = getOrCreateMetadata(target.prototype);
    md.name = target.name;
    md.tag = name || target.name;
    md.rawOutput = rawOutput;
  };
}

/**
 * Links a XML tag schema with a XMLElement subclass, setting its name to the class name.
 * The link cannot be inherited, so it must be defined on every leaf subclass.
 * @param option.rawOutput refer to XMLElement.setRawDOM()
 */
export function Tag(option?: { rawOutput?: boolean }) {
  return NamedTag(null, option);
}

/**
 * Defines the namespace on a XML tag (class) or an attribute (class property).
 * This definition cannot be inherited.
 * @param prefix namespace prefix
 * @param URI namespace URI
 */
export function NS(prefix: string, URI: string) {
  return (target: unknown, propertyKey?: string) => {
    if (propertyKey) {
      // used on property
      const md = getOrCreateMetadata(target);
      const def = getAttrDef(md, propertyKey);
      def.ns = prefix;
      def.nsURI = URI;
    } else {
      // used on class
      const md = getOrCreateMetadata((target as Ctor).prototype);
      md.ns = prefix;
      md.nsURI = URI;
    }
  };
}

/**
 * Specifies a generator function on a tag, which generates its XML attribute name from its corresponding property name.
 * Only takes effect on unnamed attributes.
 * @param generator the generator function
 */
export function AttrNameGenerator(generator: AttrNameGeneratorDef) {
  return (target: Ctor) => {
    const md = getOrCreateMetadata(target.prototype);
    md.attrNameGen = generator;
  };
}

/**
 * Specifies a converter function on an attribute, which converts between string XML attribute value and user-defined property type.
 * @param converter the converter function
 */
export function ValueConverter(converter: ValueConverterDef) {
  return (target: unknown, propertyKey: string) => {
    const md = getOrCreateMetadata(target);
    const def = getAttrDef(md, propertyKey);
    mustBeTrue(
      !def.typ || def.typ === 'string',
      `${target.constructor.name}.${propertyKey} : Cannot define type and converter at the same time`
    );
    def.converter = converter;
  };
}

/**
 * Add a validator function on an attribute, which validates the attribute value after it's converted.
 * @param validator the validator function, throws an exception in case of validation error
 */
export function Validator(validator: ValidatorDef) {
  return (target: unknown, propertyKey: string) => {
    const md = getOrCreateMetadata(target);
    const def = getAttrDef(md, propertyKey);
    if (!def.validator) {
      def.validator = [];
    }
    def.validator.push(validator);
  };
}

/**
 * Add validator functions on an attribute, which validate the attribute value after it's converted.
 * @param validators the validator functions, throw an exception in case of validation error
 */
export function Validators(validators: ValidatorDef[]) {
  return (target: unknown, propertyKey: string) => {
    const md = getOrCreateMetadata(target);
    const def = getAttrDef(md, propertyKey);
    if (!def.validator) {
      def.validator = [];
    }
    def.validator = def.validator.concat(validators);
  };
}

/**
 * Links a XML attribute with a class property.
 * The link can be inherited, so it need not to be defined under leaf subclasses.
 * @param name name of the attribute
 * @param option.typ expected type of this property, will be validated before deserialization. can be an enum type, defaults to string.
 * @param option.required is this attribute required to appear in the tag
 */
export function NamedAttr(
  name: string,
  option?: {
    typ?: PrimitiveType | Record<string, number | string>;
    required?: boolean;
  }
) {
  const { required = false, typ = 'string' } = option || {};

  return (target: unknown, propertyKey: string) => {
    const md = getOrCreateMetadata(target);
    const def = getAttrDef(md, propertyKey);
    mustBeTrue(
      typ === 'string' || !def.converter,
      `${target.constructor.name}.${propertyKey} : Cannot define type and converter at the same time`
    );

    Object.assign(def, {
      defined: true,
      prop: propertyKey,
      name,
      typ,
      required,
    });
  };
}

/**
 * Links a XML attribute with a class property, with it's name unspecified.
 * The attribute's name will be generated by AttrNameGenerator if present, or be set to the name of its corresponding class property by default.
 * The link can be inherited, need not to be defined under leaf subclasses.
 * @param option.typ expected type of this property, will be validated before deserialization
 * @param option.required is this attribute required to appear in the tag
 */
export function Attr(option?: {
  typ?: PrimitiveType | Record<string, number | string>;
  required?: boolean;
}) {
  return NamedAttr(null, option);
}

/**
 * Links a XML child element with a class property.
 * The link can be inherited, need not to be defined under leaf subclasses.
 * @param clazz class of the child element
 * @param option.minOccur minimum times of occurrence of the child element, defaults to 1. if this value is greater than 1, all children elements will be saved into an array.
 * @param option.maxOccur maximum times of occurrence of the child element, defaults to 1
 */
export function Child(
  clazz: typeof XMLElement,
  option?: {
    minOccur?: number;
    maxOccur?: number | 'unlimited';
  }
) {
  const { minOccur = 1, maxOccur = 1 } = option || {};

  mustBeTrue(minOccur >= 0, 'minOccur must be greater than 0');
  mustBeTrue(
    maxOccur === 'unlimited' || (maxOccur > 0 && minOccur <= maxOccur),
    'minOccur must be greater than 0 and smaller than maxOccur'
  );

  return (target: unknown, propertyKey: string) => {
    const md = getOrCreateMetadata(target);
    const def = getChildDef(md, propertyKey);
    Object.assign(def, {
      prop: propertyKey,
      clazz,
      minOccur,
      maxOccur,
    });
  };
}

/**
 * Links the text part under a XML tag with a class property. Must occur at most once under the tag.
 * @param option.required is the text part required to appear under the tag
 */
export function Text(option?: { required?: boolean }) {
  const { required = true } = option || {};

  return (target: unknown, propertyKey: string) => {
    const md = getOrCreateMetadata(target);
    md.text = {
      prop: propertyKey,
      required,
    };
  };
}

/**
 * Marks a function to be executed after all properties have been deserialized and validated.
 * This function can validate the whole object, and throw an exception in case of validation error.
 */
export function Ready() {
  return (
    target: unknown,
    propertyKey: string,
    _descriptor: PropertyDescriptor
  ) => {
    const md = getOrCreateMetadata(target);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    md.readyFunc = (target as any)[propertyKey]; // let the compiler ensure type safety
  };
}

function getAttrDef(md: XMLMetadata, prop: string) {
  return md.attrs[prop] || (md.attrs[prop] = { prop, defined: false });
}

function getChildDef(md: XMLMetadata, prop: string) {
  return md.children[prop] || (md.children[prop] = { prop });
}
