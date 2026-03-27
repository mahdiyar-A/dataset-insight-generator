"use client";
import React from "react";
import { useTheme, useLanguage, useAccent } from "./hooks/useTheme";

export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
  // These hooks read localStorage and apply CSS classes/variables on every page mount/navigation.
  useTheme();
  useLanguage();
  useAccent(); // restores accent CSS vars from localStorage on every page

  return <>{children}</>;
}
