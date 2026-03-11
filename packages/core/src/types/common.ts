export type Brand<TValue, TName extends string> = TValue & { readonly __brand: TName };

export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;
export type EpochMs = Brand<number, 'EpochMs'>;

export type SymbolCode = Brand<string, 'SymbolCode'>;
export type DatasetId = Brand<string, 'DatasetId'>;
export type RunId = Brand<string, 'RunId'>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
