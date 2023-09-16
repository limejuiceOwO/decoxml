export function mustBeTrue(value: boolean, errMsg: string) {
  if (value !== true) {
    throw new Error(errMsg);
  }
}

export function isNil(value: unknown) {
  return value === undefined || value === null;
}

export function notNil(value: unknown, errMsg: string) {
  if (isNil(value)) {
    throw new Error(errMsg);
  }
}

export function isInvalidStr(value: unknown) {
  return typeof value != 'string' || value === '';
}
