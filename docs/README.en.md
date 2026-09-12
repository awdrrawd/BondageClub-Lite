# Documentation

[Project overview](../README.en.md) · [繁體中文](README.md) · [Architecture overview (HTML)](https://github.com/awdrrawd/BondageClub-Lite/blob/Mater/docs/architecture/index.html)

Detailed behavior, architecture, deployment and verification guides live here. The linked guides are currently in Chinese. See Git history for past changes.

| Topic | Guide |
| --- | --- |
| Architecture and module responsibilities | [Architecture](architecture.md), [Architecture overview (HTML)](https://github.com/awdrrawd/BondageClub-Lite/blob/Mater/docs/architecture/index.html) |
| CI, dependency updates, health checks and dashboard setup | [Automation (Chinese + English summary)](automation.md) |
| Cloudflare build triggers | [Build watch paths (Chinese)](cloudflare-builds.md) |
| Local development, deployment and relay troubleshooting | [Deployment and verification](deployment-and-tests.md) |
| Mobile layout and reconnection | [Mobile and connection behavior](mobile-connection-tests.md) |
| Rooms, friends, chat and DOM updates | [Rooms and chat](chat-layout-tests.md) |
| Local history, unread messages, search and TXT / HTML / Excel export | [History and contacts](local-history-and-contacts.md) |
| Credentials, media permissions, sounds and data storage | [Privacy and appearance](privacy-and-appearance.md) |
| Activities and community protocol support | [Activities and identity](chat-native-identity-tests.md) |
| ECHO cuddle confirmation and synchronization | [Cuddle verification](echo-cuddle-tests.md) |
| Links, media permissions and safewords | [Media and safewords](links-safeword-tests.md) |
| Translation sources and contribution workflow | [Translation guide](../src/translations/README.md) |
| Third-party sources and licensing | [Notices](THIRD-PARTY-NOTICES.md), [Dialogue sources](third-party-dialogues.md), [License texts](licenses/) |

The HTML overview link opens its source on GitHub. Download it to view in a browser; it is also included in the site build. Other Markdown files are repository documentation. Automated tests do not replace live BC, Cloudflare or mobile verification.

## Maintenance

- Update the relevant topic instead of adding release-specific notes.
- Keep the Markdown architecture guide and HTML overview in sync.
- Check privacy and history documentation when storage behavior changes.
- Distinguish manual test instructions from completed verification.
- Keep changing test counts and bundle sizes in build output rather than copying them into documentation.
