declare module "opencc-js" {
  export function Converter(options: { from: "tw" | "cn"; to: "tw" | "cn" }): (text: string) => string;
}
