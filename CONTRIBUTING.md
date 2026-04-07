# Contributing to Rich Markdown Diff

First off, thank you for considering contributing to Rich Markdown Diff!

## How Can I Contribute?

### Reporting Bugs

- **Check for existing issues.**
- **Use a clear and descriptive title.**
- **Describe the exact steps** to reproduce the problem.

### Suggesting Enhancements

- **Make sure it fits the goals** of the project.
- **Detail your idea** clearly.

### Pull Requests

1. **Create a new branch** for your feature or bug fix.
2. **Write clear commit messages.**
3. **Include tests** if possible.
4. **Ensure the build passes.**

## Development Setup

1. **Clone the repository.**
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Compile and Lint:**
   ```bash
   pnpm run compile
   pnpm run lint
   ```
4. **Run Extension:**
   - Open this folder in VS Code.
   - Press `F5` to start debugging (Launches a new Extension Development Host window).

5. **Run Tests:**
   ```bash
   pnpm test
   # or for unit tests
   pnpm run test:unit
   ```

## License

By contributing, you agree that your contributions will be licensed under the MIT License of the project.
