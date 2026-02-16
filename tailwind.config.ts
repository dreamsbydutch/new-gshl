import { type Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        nav: "0 1px 10px #161616",
        default: "0 3px 10px #787878",
        btn: "inset 0.2rem -0.6rem 0.2rem -0.15rem #a1a1a15a",
        emboss:
          "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 2px rgba(0,0,0,0.3), 0 0 4px 1px rgba(0,0,0,0.2), inset 0 3px 2px rgba(255,255,255,.22), inset 0 -3px 2px rgba(0,0,0,.15), inset 0 20px 10px rgba(255,255,255,.12), 0 0 4px 1px rgba(0,0,0,.1), 0 3px 2px rgba(0,0,0,.2)",
        inv: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
        "inv-sm": "inset 0 1px 2px 0 rgb(0 0 0 ont/ 0.05)",
        "inv-md":
          "inset 0 4px 6px -1px rgb(0 0 0 / 0.1), inset 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        "inv-lg":
          "inset 0 10px 15px -3px rgb(0 0 0 / 0.1), inset 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        "inv-xl":
          "inset 0 20px 25px -5px rgb(0 0 0 / 0.1), inset 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      },
      zIndex: {
        "-1": "-1",
      },
      textShadow: {
        eng: "rgba(245,245,245,0.5) 3px 5px 1px",
        sm: "0 1px 2px var(--tw-shadow-color)",
        DEFAULT: "0 2px 4px var(--tw-shadow-color)",
        lg: "0 8px 16px var(--tw-shadow-color)",
      },
      fontSize: {
        "3xs": ["0.5rem", "0.75rem"],
        "2xs": ["0.625rem", "1rem"],
      },
      fontFamily: {
        varela: ["var(--font-varela)"],
        yellowtail: ["var(--font-yellowtail)"],
        barlow: ["var(--font-barlow)"],
        oswald: ["var(--font-oswald)"],
      },
      translate: {
        navbarActive: "-8px",
        navbarActiveLg: "-4px",
      },
      keyframes: {
        btnClick: {
          "0%, 100%": {
            transform: "scale(1)",
          },
          "50%": {
            transform: "scale(0.85)",
          },
        },
        toggleClick: {
          "0%, 100%": {
            transform: "scale(1)",
          },
          "50%": {
            transform: "scale(0.9)",
          },
        },
      },
      animation: {
        btnClick: "btnClick 150ms ease-in-out",
        toggleClick: "toggleClick 75ms ease-in-out",
      },
      colors: {
        hotel: {
          "50": "#ffefe8",
          "100": "#ffddc1",
          "200": "#ffa7a1",
          "300": "#eb8c87",
          "400": "#cd716d",
          "500": "#b05855",
          "600": "#933f3e",
          "700": "#772628",
          "800": "#5b0a14",
          "900": "#410000",
        },
        sunview: {
          "50": "#effdff",
          "100": "#abccff",
          "200": "#8eb1f1",
          "300": "#7396d4",
          "400": "#577cb8",
          "500": "#3b649d",
          "600": "#1a4c83",
          "700": "#00366a",
          "800": "#002151",
          "900": "#00093a",
        },
        brown: {
          "50": "#fdf8f6",
          "100": "#f2e8e5",
          "200": "#eaddd7",
          "300": "#e0cec7",
          "400": "#d2bab0",
          "500": "#bfa094",
          "600": "#a18072",
          "700": "#977669",
          "800": "#846358",
          "900": "#43302b",
        },
        champ: {
          "50": "hsl(51, 100%, 97%)",
          "100": "hsl(51, 100%, 96%)",
          "200": "hsl(51, 100%, 94%)",
          "300": "hsl(51, 100%, 92%)",
          "400": "hsl(51, 100%, 88%)",
          "500": "hsl(51, 100%, 84%)",
          "600": "hsl(51, 100%, 72%)",
          "700": "hsl(51, 100%, 60%)",
          "800": "hsl(51, 100%, 45%)",
          "900": "hsl(51, 100%, 35%)",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      gridTemplateColumns: {
        "12": "`repeat(12, minmax(0, 1fr))`",
        "13": "`repeat(13, minmax(0, 1fr))`",
        "14": "`repeat(14, minmax(0, 1fr))`",
        "15": "`repeat(15, minmax(0, 1fr))`",
        "16": "`repeat(16, minmax(0, 1fr))`",
        "17": "`repeat(17, minmax(0, 1fr))`",
        "18": "`repeat(18, minmax(0, 1fr))`",
        "19": "`repeat(19, minmax(0, 1fr))`",
        "20": "`repeat(20, minmax(0, 1fr))`",
        skaterStatTable:
          "`minmax(35px, 1fr) minmax(50px, 1fr) minmax(30px, 1fr) repeat(8, minmax(25px, 1fr)) minmax(35px, 1fr)`",
        goalieStatTable:
          "`minmax(35px, 1fr) minmax(68px, 1fr) minmax(50px, 1fr) minmax(20px, 1fr) minmax(20px, 1fr) repeat(3, minmax(30px, 1fr))`",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
