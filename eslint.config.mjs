/*
 * MIT License
 *
 * Copyright (c) 2026 Rich Markdown Diff Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";

export default tseslint.config(
  {
    ignores: ["out/**", "dist/**", "**/node_modules/**", "**/*.d.ts"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  jsdoc.configs['flat/recommended-tsdoc'],
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-yields": "off",
      "jsdoc/tag-lines": "off",
      "jsdoc/require-description": "off",
      curly: "warn",
      eqeqeq: "warn",
      semi: ["warn", "always"],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "no-prototype-builtins": "off",
      "no-useless-escape": "off",
      "prefer-const": "warn",
    },
  },
);
