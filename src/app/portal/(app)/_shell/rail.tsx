"use client";

import { createContext, useContext } from "react";

/** Whether the sidebar is folded to its icon rail (desktop only). */
export const RailContext = createContext(false);
export const useRail = () => useContext(RailContext);
