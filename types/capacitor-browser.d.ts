// Ambient declaration for @capacitor/browser — used only on native via a guarded
// dynamic import (wrapped in try/catch) and not installed in this web project.
// Declaring it here lets type-checking pass without adding a web dependency.
declare module "@capacitor/browser" {
  export const Browser: {
    open(options: { url: string; presentationStyle?: "fullscreen" | "popover"; windowName?: string; toolbarColor?: string }): Promise<void>;
    close(): Promise<void>;
  };
}
