import * as OpenCC from "opencc-js";

let traditionalConverter: ((text: string) => string) | null = null;

export function traditionalToSimplified(text: string): string {
  const converter = traditionalConverter ?? OpenCC.Converter({ from: "tw", to: "cn" });
  traditionalConverter = converter;
  return converter(text);
}
