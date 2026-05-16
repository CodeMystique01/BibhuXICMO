"use client";

import { createContext, useContext } from "react";

type CommandPaletteCtx = {
  open: () => void;
};

export const CommandPaletteContext = createContext<CommandPaletteCtx>({
  open: () => {},
});

export const useCommandPalette = () => useContext(CommandPaletteContext);
