## Code Quality & Testing
![Pylint](https://img.shields.io/badge/Pylint-8.97%2F10-brightgreen)
TrafficCare follows a structured testing and code-quality workflow to improve reliability and maintainability.

### Code Quality
- **Pylint Score:** 8.97/10
- Python static code analysis performed using Pylint.

### Unit Testing

| Component | Testing Framework | Tests Passed |
|---|---|---:|
| Frontend (React) | Vitest + React Testing Library | 13 |
| Backend (Node.js) | Jest | 40 |
| Deep Learning API (Python) | PyUnit (`unittest`) | 6 |
| **Total** | | **59** |

### Testing Highlights
- Frontend component testing.
- Backend authentication, complaint and admin testing.
- Deep learning API input validation and prediction response testing.
- Python code-quality analysis using Pylint.

*Note: The DL prediction test uses a mocked model to validate API behaviour, not actual model accuracy.*