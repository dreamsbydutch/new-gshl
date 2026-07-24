import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "apps-script/**",
      "scripts/**",
      "tools/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["postcss.config.js", "prettier.config.js"],
    rules: {
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next/navigation",
                "@gshl-trpc",
                "@gshl-trpc/*",
                "@gshl-cache",
                "@gshl-cache/*",
                "@gshl-server",
                "@gshl-server/*",
                "@gshl-api",
                "@gshl-api/*",
              ],
              message:
                "Components and route UI should use @gshl-hooks, not Next navigation or data/cache/server modules directly.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message: "Move frontend interfaces to src/lib/types.",
        },
        {
          selector: "TSTypeAliasDeclaration",
          message: "Move frontend type aliases to src/lib/types.",
        },
      ],
    },
  },
  {
    files: ["src/hooks/**/*.{ts,tsx}"],
    ignores: ["src/hooks/main/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@gshl-components",
                "@gshl-components/*",
                "@gshl-ui",
                "@gshl-nav",
                "@gshl-skeletons",
                "./components/*",
                "./components/**",
                "../components/*",
                "../components/**",
                "../../components/*",
                "../../components/**",
                "../../../components/*",
                "../../../components/**",
              ],
              message: "Hooks may not import components.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message: "Move hook interfaces to src/lib/types.",
        },
        {
          selector: "TSTypeAliasDeclaration",
          message: "Move hook type aliases to src/lib/types.",
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: [
      "src/app/api/**",
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/error.tsx",
      "src/app/**/template.tsx",
      "src/app/**/default.tsx",
      "src/app/**/route.ts",
      "src/app/not-found.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Keep src/app limited to route files and route-only helpers.",
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message: "Move frontend interfaces in src/app to src/lib/types.",
        },
        {
          selector: "TSTypeAliasDeclaration",
          message: "Move frontend type aliases in src/app to src/lib/types.",
        },
      ],
    },
  },
  {
    files: ["src/lib/types/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "@gshl-hooks",
                "@gshl-hooks/*",
                "@gshl-components",
                "@gshl-components/*",
                "@gshl-ui",
                "@gshl-nav",
                "@gshl-skeletons",
                "@gshl-utils",
                "@gshl-utils/*",
              ],
              message:
                "src/lib/types must stay isolated from Next runtime modules, hooks, components, and utils.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "FunctionDeclaration",
          message: "Keep runtime logic out of src/lib/types.",
        },
        {
          selector: "ClassDeclaration",
          message: "Keep runtime logic out of src/lib/types.",
        },
        {
          selector: "TSEnumDeclaration",
          message: "Keep runtime enums out of src/lib/types.",
        },
        {
          selector: "VariableDeclaration",
          message: "Keep runtime values out of src/lib/types.",
        },
      ],
    },
  },
  {
    files: ["src/lib/utils/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "next",
                "next/*",
                "@gshl-hooks",
                "@gshl-hooks/*",
                "@gshl-components",
                "@gshl-components/*",
              ],
              message:
                "Utilities must stay framework-free and cannot import hooks or components.",
            },
          ],
        },
      ],
    },
  },
);
