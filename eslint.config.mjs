// Flat ESLint config (ESLint v9+). `next lint` is deprecated on this Next.js
// version, so we run ESLint directly (`npm run lint` → `eslint src`) and bridge
// the legacy `next/core-web-vitals` + `next/typescript` shareable configs via
// FlatCompat.
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
