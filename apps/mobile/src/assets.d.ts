/** Fonts bundled by Metro: importing one gives its asset id, which `useFonts` takes. */
declare module "*.ttf" {
  const asset: number;
  export default asset;
}
