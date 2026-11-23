@'
# Tes XecureIt - Frontend

Frontend web application built with Next.js, TypeScript, and Tailwind CSS featuring role-based access (`OWNER`, `EDITOR`, `VIEWER`) and SHA-256 document verification.

## Tech Stack
- **Framework & UI:** Next.js (`^16.4.6`), React (`^19.1.0`)
- **Language & Type Checking:** TypeScript (`^5.8.3`), `tsc --noEmit`
- **Styling:** Tailwind CSS (`^3.4.17`), PostCSS (`^8.5.23`), Autoprefixer (`^10.4.21`)
- **Container & Setup:** Docker (`Dockerfile`), `setup-frontend.cmd`

## Project Structure
```text
├── .env.local.example      # Frontend environment variable template
├── Dockerfile              # Container build configuration
├── next-env.d.ts           # Next.js TypeScript environment declarations
├── package.json            # Dependencies and npm scripts
├── package-lock.json       # Locked dependency tree
├── postcss.config.js       # PostCSS configuration
├── setup-frontend.cmd      # Windows setup helper script
├── tailwind.config.ts      # Tailwind CSS configuration
└── tsconfig.json           # TypeScript compiler configuration

## Getting Started

```bash
npm install
npm run dev