# Contributing to MW-Price-Checker

Thank you for considering contributing to Matrix Warehouse's Price Checker app! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Report issues professionally

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Create a new issue with a clear title
3. Include:
   - Browser and OS information
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

### Suggesting Features

1. Check if the feature already exists
2. Provide a clear use case
3. Explain the benefit to Matrix Warehouse

### Submitting Code

1. **Fork the repository**
   ```bash
   git clone https://github.com/YOUR-USERNAME/MW-Price-Checker.git
   cd MW-Price-Checker
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow existing code style
   - Write clean, commented code
   - Test thoroughly

4. **Commit your changes**
   ```bash
   git commit -m "Add: brief description of changes"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Provide clear description
   - Link related issues
   - Include any breaking changes

## Code Standards

### JavaScript
- Use vanilla JS (no frameworks required)
- Follow ES6+ syntax
- Use meaningful variable names
- Add comments for complex logic
- Test in multiple browsers

### CSS
- Use CSS custom properties (--variable)
- Follow BEM naming convention where applicable
- Ensure mobile responsiveness
- Maintain Matrix theme aesthetics

### HTML
- Use semantic markup
- Ensure accessibility (ARIA labels)
- Keep structure clean and organized

## Testing

Before submitting:
- Test camera functionality on multiple devices
- Verify CSV parsing with sample data
- Test on mobile and desktop browsers
- Check accessibility with screen readers

## Documentation

- Update README.md if adding features
- Add inline comments for complex code
- Document new CSV column requirements

## Pull Request Process

1. Update documentation
2. Test thoroughly
3. Ensure code follows style guidelines
4. Link related issues
5. Wait for review and feedback
6. Address any requested changes

## Questions?

- Open an issue with the `question` label
- Check existing discussions
- Review the documentation

## License

By contributing, you agree your code will be under the MIT License.

---

**Thank you for making MW-Price-Checker better! 💚**