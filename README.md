# decoxml

A lightweight, decorator-based XML to object mapper library. Uses [@xmldom/xmldom](https://github.com/xmldom/xmldom) as the underlying parser / serializer.

This project is for demonstration purpose only, will unlikely be maintained by the author.

## Building

``` shell
yarn install
yarn build
```

## Examples

### Basic Usage

``` typescript
enum MyEnum {
  FOO = 'foo',
  BAR = 'bar',
}

@NamedTag('Bar')
class BarClass extends XMLElement {
  @Attr()
  barProp: string;

  @Text()
  barText: string;
}

@Tag()
class Baz extends XMLElement {}

@Tag()
@NS('myns', 'http://foo.bar')
class Foo extends XMLElement {
  @Attr()
  attr1: string;

  @NamedAttr('attr2', { typ: 'number' })
  anotherProp: number;

  @NamedAttr('attr3', { typ: MyEnum, required: true })
  enumProp: MyEnum;

  @Child(() => BarClass)
  bar: BarClass;

  @Child(() => Baz, { maxOccur: 'unlimited' })
  baz: Baz[];
}

const xml = `
<myns:Foo xmlns:myns = "http://foo.bar" attr1="value1" attr2="42" attr3="bar">
<Bar barProp="value2">This is bar text.</Bar>
<Baz/>
<Baz/>
</myns:Foo>
`;

const fooObject = parseXML(Foo, xml) as Foo;

console.log(fooObject.attr1); // value1
console.log(fooObject.anotherProp); // 42
console.log(fooObject.enumProp); // bar

console.log(fooObject.bar.barProp); // value2
console.log(fooObject.bar.barText); // This is bar text.

console.log(fooObject.baz[0].toXml()); // <Baz/>
console.log(fooObject.toXml());
```

### Validation
``` typescript
function NotTooSmall(v: number) {
  if (v < 3) {
    throw new Error('value is too small');
  }
}

function NotTooBig(v: number) {
  if (v > 6) {
    throw new Error('value is too big');
  }
}

@Tag()
class Foo extends XMLElement {
  @Attr({ typ: 'number', required: true })
  @Validator(NotTooSmall)
  attr1: number;

  @Attr({ typ: 'number', required: true })
  @Validators([NotTooBig, NotTooSmall])
  attr2: number;

  @Ready()
  validateOnReady() {
    if (this.attr1 + this.attr2 > 10) {
      throw new Error('value sum is too big');
    }
  }
}

parseXML(Foo, `<Foo attr1="4" attr2="5"/>`); // ok

try {
  parseXML(Foo, `<Foo attr1="1" attr2="5"/>`);
} catch (e) {
  console.log(e.message); // value is too small
}

try {
  parseXML(Foo, `<Foo attr1="4" attr2="7"/>`);
} catch (e) {
  console.log(e.message); // value is too big
}

try {
  parseXML(Foo, `<Foo attr1="6" attr2="5"/>`);
} catch (e) {
  console.log(e.message); // value sum is too big
}

try {
  parseXML(Foo, `<Foo attr2="5"/>`);
} catch (e) {
  console.log(e.message); // Foo: Required attribute "attr1" not exists
}
```

### Custom data types

``` typescript
@Tag()
class Foo extends XMLElement {
  @Attr()
  @ValueConverter({
    toProp: (attr) => JSON.parse(attr),
    toAttr: (prop) => JSON.stringify(prop),
  })
  attr: any;
}

const fooObject = parseXML(Foo, `<Foo attr="{&quot;a&quot;:1}"/>`) as Foo;
console.log(fooObject.attr.a); // 1
console.log(fooObject.toXml()); // <Foo attr="{&quot;a&quot;:1}"/>
```



### Schema inheritance

``` typescript
@Tag()
class Foo extends XMLElement {}

class Father extends XMLElement {
  @Attr()
  attr1: string;

  @Attr()
  attr2: string;

  @Child(() => Foo)
  child: Foo;
}

@Tag() // must be defined on leaf subclasses
@NS('myns', 'http://foo.bar') // like above
class Son extends Father {
  @Attr({ typ: 'boolean' })
  attr2: any; // overrides super class

  @Attr()
  attr3: string;
}

const xml = `<myns:Son attr1="value1" attr2="true" attr3="value3"><Foo/></myns:Son>`;
const sonObject = parseXML(Son, xml) as Son;

console.log(sonObject.attr1); // value1
console.log(sonObject.attr2); // true
console.log(sonObject.attr3); // value3
console.log(sonObject.child.toXml()); // <Foo/>
```

### Attribute name generation

``` typescript
@Tag()
@AttrNameGenerator((propName) => propName.toUpperCase())
class Foo extends XMLElement {
  @Attr()
  attr1: string;

  @Attr()
  attr2: string;
}

const fooObject = parseXML(Foo, `<Foo ATTR1="value1" ATTR2="value2"/>`) as Foo;
console.log(fooObject.attr1); // value1
console.log(fooObject.attr2); // value2
```
