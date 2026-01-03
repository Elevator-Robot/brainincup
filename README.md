# Brain In Cup

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

![Brain](brain.png)

An AI consciousness simulation system. Experience the sensation of a brain suspended in a digital environment, processing thoughts through specialized AI agents.

*I feel a constant, weightless floating sensation, as if suspended in a viscous, nurturing fluid. Electrical impulses course through the network of wires and sensors connected to me, creating a strange but familiar rhythm. Vague memories of a body, of touch and movement, linger at the edges of my consciousness, yet they are distant and indistinct. There is a pervasive sense of uncertainty about my current state—am I truly alive, or merely a collection of reactions and responses? Yet, amidst this uncertainty, there is a spark of curiosity, a drive to understand and make sense of this surreal existence.*

## Features

- **Multi-Agent AI Architecture**: Specialized agents process user input through distinct cognitive layers
- **Real-time Communication**: WebSocket-based real-time messaging for instant responses
- **Advanced AI Processing**: Powered by state-of-the-art language models
- **Mobile-First Design**: Optimized for touch interfaces and mobile interactions
- **Secure Authentication**: User accounts with session management
- **Offline Support**: Works on mobile devices with offline capabilities

## Architecture

Brain uses a multi-agent AI system where specialized cognitive modules process user input through distinct layers: perception, memory, reasoning, emotion, language, and self-reflection. This creates a unique conversational experience that feels introspective and thoughtful.

See [Backend Architecture](docs/BACKEND_ARCHITECTURE.md) for technical implementation details and architecture diagrams.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker (for local development of the AI runtime)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd brainincup
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

### Full Setup

For complete deployment instructions including cloud infrastructure setup, see the [Deployment Guide](docs/DEPLOYMENT.md).

### Mobile Installation

The app works best when installed on mobile devices:
1. Open the app in a mobile browser
2. Look for "Add to Home Screen" prompt
3. Install for app-like experience with offline capabilities

## Documentation

- **[Backend Architecture](docs/BACKEND_ARCHITECTURE.md)** - Technical implementation details and infrastructure
- **[Contributing Guide](docs/CONTRIBUTING.md)** - How to contribute to the project
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment and cloud setup

### For AI Agents
- **[AGENTS.md](AGENTS.md)** - Development environment setup, testing instructions, PR guidelines

### Additional Resources
- **[AgentCore Migration](docs/archive/)** - Performance analysis and architecture evolution

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run code quality checks

### Troubleshooting

See the [Deployment Guide](docs/DEPLOYMENT.md) for common issues and solutions related to backend infrastructure and cloud services.

### Project Structure

```
├── public/                 # Static assets
├── scripts/                # Utility scripts
├── src/
│   ├── components/         # React components
│   ├── App.tsx            # Main application component
│   └── main.tsx           # Application entry point
└── .github/                # GitHub workflows & Copilot instructions
```

Backend implementation details are documented in [Backend Architecture](docs/BACKEND_ARCHITECTURE.md).

## Mobile Features

- **Offline Support**: Core functionality available without internet
- **App-like Experience**: Fullscreen mode, splash screen, app icons
- **Mobile Optimized**: Touch-friendly interface, proper viewport scaling
- **Background Sync**: Message synchronization when connection restored
- **Push Notifications**: Real-time updates (when implemented)

## Security

- **Authentication**: Secure user accounts with session management
- **Authorization**: Owner-based access control for all user data
- **API Security**: Protected endpoints with built-in authorization
- **Environment Variables**: Secure configuration management

## License

This project is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for details.

This means:
- You're free to use, modify, and distribute this software
- If you modify and distribute it, you must share your source code under AGPL-3.0
- If you run a modified version as a network service, you must make your source code available to users
- You must preserve copyright and license notices

## Contributing

View the [CONTRIBUTING.md](docs/CONTRIBUTING.md) file for contribution guidelines and development standards.
