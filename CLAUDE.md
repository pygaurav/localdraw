# CLAUDE.md

## Project Structure

LocalDraw is a **monorepo** with a clear separation between the core library and the application:

- **`packages/localdraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`localdraw-app/`** - Full-featured web application that uses the library
- **`packages/`** - Core packages: `@localdraw/common`, `@localdraw/element`, `@localdraw/math`, `@localdraw/utils`
- **`examples/`** - Integration examples (NextJS, browser script)

## Development Workflow

1. **Package Development**: Work in `packages/*` for editor features
2. **App Development**: Work in `localdraw-app/` for app-specific features
3. **Testing**: Always run `yarn test:update` before committing
4. **Type Safety**: Use `yarn test:typecheck` to verify TypeScript

## Development Commands

```bash
yarn test:typecheck  # TypeScript type checking
yarn test:update     # Run all tests (with snapshot updates)
yarn fix             # Auto-fix formatting and linting issues
```

## Architecture Notes

### Package System

- Uses Yarn workspaces for monorepo management
- Internal packages use path aliases (see `vitest.config.mts`)
- Build system uses esbuild for packages, Vite for the app
- TypeScript throughout with strict configuration
