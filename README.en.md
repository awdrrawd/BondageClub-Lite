# BondageClub-Lite

[繁體中文](README.md) · [Documentation](docs/README.en.md)

An unofficial, lightweight text client for Bondage Club, focused on chat without character rendering or the full game engine.

## Features

- Search, filter, create and join rooms.
- Chat, whispers, BEEP, friends and recent contacts.
- Private-message unread indicators, replies and separate notification sound toggles.
- Local history search and TXT, HTML and Excel export.
- Automatic reconnection, with the chat view and drafts preserved during temporary disconnections. Messages are never resent automatically.
- Chinese and English interfaces, mobile layouts, profile viewing and text activities.

Wardrobe tools, character rendering and full plugin functionality are not included.

## Development

Use Node.js 22.13+:

```sh
npm ci
npm run dev:ui
```

This opens a mock preview without logging in. Production deployment uses Cloudflare Pages; see the [deployment guide (Chinese)](docs/deployment-and-tests.md) for build, test and relay setup.

## Documentation

- [Architecture (Chinese)](docs/architecture.md)
- [History and export (Chinese)](docs/local-history-and-contacts.md)
- [Privacy and data storage (Chinese)](docs/privacy-and-appearance.md)
- [Translation contributions (Chinese)](src/translations/README.md)

Credentials and game traffic pass through the deployment's Cloudflare relay. Use a deployment you trust. Chat history is saved locally by default; logging out does not delete saved records.

## License

Original code is licensed under [MIT](LICENSE). Third-party assets and text retain their [respective licenses](docs/THIRD-PARTY-NOTICES.md).
