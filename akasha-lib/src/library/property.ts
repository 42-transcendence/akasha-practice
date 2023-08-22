export function initProperties<T extends object>(
  model: T,
  payload: Record<keyof T, any>
) {
  Object.keys(model).forEach((e) => {
    const key = e as keyof T;
    model[key] = payload[key];
  });
}

export function hasProperty<T extends object, K extends keyof any>(
  type: "string",
  value: T,
  key: K
): value is T & Record<K, string>;
export function hasProperty<T extends object, K extends keyof any>(
  type: "number",
  value: T,
  key: K
): value is T & Record<K, number>;
export function hasProperty<T extends object, K extends keyof any>(
  type: "bigint",
  value: T,
  key: K
): value is T & Record<K, bigint>;
export function hasProperty<T extends object, K extends keyof any>(
  type: "boolean",
  value: T,
  key: K
): value is T & Record<K, boolean>;
export function hasProperty<T extends object, K extends keyof any>(
  type: "symbol",
  value: T,
  key: K
): value is T & Record<K, symbol>;
export function hasProperty<T extends object, K extends keyof any>(
  type: "undefined",
  value: T,
  key: K
): value is T & Record<K, undefined>;
export function hasProperty<T extends object, K extends keyof any>(
  type: "object",
  value: T,
  key: K
): value is T & Record<K, object | null>;
export function hasProperty<T extends object, K extends keyof any>(
  type: "function",
  value: T,
  key: K
): value is T & Record<K, Function>;

export function hasProperty<T extends object, K extends keyof any>(
  type:
    | "string"
    | "number"
    | "bigint"
    | "boolean"
    | "symbol"
    | "undefined"
    | "object"
    | "function",
  value: T,
  key: K
): value is T & Record<K, unknown> {
  return (
    key in value && typeof (value as Record<keyof any, unknown>)[key] === type
  );
}
