# Telegram to WhatsApp CLI Tool

A Node.js command-line tool for importing Telegram chat exports to WhatsApp with rate limiting, progress tracking, and resume functionality.

## Features

- Import Telegram chat exports (result.json format) to WhatsApp
- **Built-in WhatsApp authentication** - Login once, stay connected
- **Chat listing** - Easily find chat IDs without browser console
- **Message date and sender prefixing** - Preserves original timestamps and sender information
- Rate limiting to avoid WhatsApp detection (3-10 second delays)
- Progress tracking with resume capability
- Media file validation and transfer
- Cross-platform support (Windows, macOS, Linux)
- Comprehensive error handling and recovery

## Requirements

- Node.js 18+ (for ES modules support)
- WhatsApp Web account
- Telegram chat export in JSON format

## Installation

### Straight from GitHub

```bash
git clone <repository-url>
cd move-telegram-to-whatsapp
npm install
```

### NPM - Coming soon
```bash
npm install -g telegram-to-whatsapp
```

## Usage

The tool works in three steps: **authentication**, **plan** generation, and **execution**.

### 1. Login to WhatsApp

First, authenticate with WhatsApp Web:

```bash
# Global installation
telegram-to-whatsapp login

# Local development
node src/cli/index.js login
```

This will:
- Display a QR code in your terminal
- Scan the QR code with WhatsApp mobile app
- Store authentication in `.wwebjs_auth` directory
- Keep you logged in for future commands

### 2. List Available Chats

Find the chat ID where you want to import messages:

```bash
# Global installation
telegram-to-whatsapp list

# Local development
node src/cli/index.js list
```

**Example output:**
```
🔍 Retrieving WhatsApp chats...
✓ Connected to WhatsApp

Recent Chats:
1. Family Group        → 120363044567890123@g.us
2. John Doe           → 1234567890@c.us
3. Work Team          → 120363098765432101@g.us
4. Jane Smith         → 9876543210@c.us

Use the chat ID (right column) with the execute command.
```

### 3. Generate Import Plan

Create an import plan from your Telegram export:

```bash
# Global installation
telegram-to-whatsapp plan ./path/to/telegram-export/

# Local development
node src/cli/index.js plan ./path/to/telegram-export/
```

This will:

- Parse your Telegram export (`result.json`)
- Validate messages and media files
- Generate an import plan with statistics
- Save the plan as `import-plan.json`

**Example output:**

```
✓ Parsed 1,247 messages from Telegram export
✓ Found 89 media files (photos: 45, videos: 12, documents: 32)
✓ Import plan saved to: ./telegram-export/import-plan.json

Statistics:
- Total messages: 1,247
- Text messages: 1,158
- Media messages: 89
- Messages will include original date and sender info
- Estimated import time: ~2.5 hours
```

### 4. Execute Import

Execute the import plan to WhatsApp using the chat ID from step 2:

```bash
# Global installation
telegram-to-whatsapp execute ./path/to/output/ --target-chat "1234567890@c.us"

# Local development
node src/cli/index.js execute ./path/to/output/ --target-chat "1234567890@c.us"
```

**Required options:**

- `--target-chat`: WhatsApp chat ID (format: `phone@c.us` for individual, `groupid@g.us` for groups)

**Optional options:**

- `--delay-min`: Minimum delay between messages in seconds (default: 3)
- `--delay-max`: Maximum delay between messages in seconds (default: 10)
- `--resume`: Resume from previous interruption (default: true)

## Getting WhatsApp Chat ID

### Recommended Method (Using CLI)

1. Run `telegram-to-whatsapp login` to authenticate
2. Run `telegram-to-whatsapp list` to see all available chats
3. Copy the chat ID from the list output

### Alternative Method (Browser Console)

If the list command doesn't show your desired chat:

1. Open WhatsApp Web in your browser
2. Open Developer Tools (F12)
3. Navigate to the target chat
4. In Console, run: `window.Store.Chat.models.find(chat => chat.name === 'Chat Name').id._serialized`
5. Use the returned ID (e.g., `1234567890@c.us`)

## Telegram Export Format

The tool expects Telegram exports in the standard JSON format:

1. Open Telegram Desktop
2. Go to Settings > Advanced > Export Telegram Data
3. Select "Machine-readable JSON" format
4. Choose chats and media to export
5. Wait for export completion

Your export should contain:

```
telegram-export/
├── result.json          # Main chat data (required)
├── photos/              # Photo files (optional)
├── videos/              # Video files (optional)
├── voice_messages/      # Audio files (optional)
└── files/              # Document files (optional)
```

### Message Format in WhatsApp

All imported messages will be prefixed with the original timestamp and sender information:

```
[2024-12-15 14:30:45] [John Doe] Hello, this is the original message
[2024-12-15 14:31:02] [Jane Smith] Reply with media attachment
```

This preserves the context and chronology of the original Telegram conversation.

## Progress Tracking

The tool automatically tracks progress and supports resume:

- Progress saved to `progress.jsonl` in the output directory
- Interrupted imports can resume from the last successful message
- No duplicate messages are sent during resume
- Progress statistics displayed during execution

**Example progress output:**

```
🔄 Importing messages to WhatsApp...
📱 Please scan QR code in WhatsApp Web (if not already authenticated)
✓ WhatsApp client connected

Progress: [████████░░] 812/1,247 messages (65%)
⏱️  Estimated time remaining: 45 minutes
💤 Rate limiting: 5.2s delay between messages
```

## Error Handling

The tool includes comprehensive error handling:

- **Connection errors**: Automatic retry with exponential backoff
- **Rate limiting**: Respects WhatsApp's limits with configurable delays
- **Media failures**: Continues with text-only message if media fails
- **Authentication**: Persistent session storage (no repeated QR scanning)

## File Structure

After running the tool, your output directory will contain:

```
output-directory/
├── import-plan.json     # Generated import plan
├── progress.jsonl       # Progress tracking (one record per line)
├── .wwebjs_auth/       # WhatsApp session data (persistent)
└── .wwebjs_cache/      # WhatsApp cache files
```

## Limitations

- **Rate Limits**: WhatsApp enforces message limits (start at 250-1000/day)
- **File Size**: 16MB limit for photos/videos, 100MB for documents
- **Media Types**: Only supports standard Telegram media formats
- **Authentication**: Requires WhatsApp Web access

## Troubleshooting

### QR Code Issues

```bash
# Clear authentication and rescan
rm -rf ./output/.wwebjs_auth/
telegram-to-whatsapp execute ./output/ --target-chat "chat@c.us"
```

### Rate Limiting Detected

```bash
# Increase delays between messages
telegram-to-whatsapp execute ./output/ --target-chat "chat@c.us" --delay-min 10 --delay-max 20
```

### Resume Failed Import

```bash
# Resume automatically detects interruption
telegram-to-whatsapp execute ./output/ --target-chat "chat@c.us" --resume
```

### Large Export Performance

For exports with 1000+ messages:

- Use SSD storage for better I/O performance
- Ensure stable internet connection
- Consider running overnight for large imports

## Development

```bash
# Run tests
npm test

# Run linting
npm run lint

# Development with file watching
npm run dev

# Run both tests and lint (recommended before commits)
npm test && npm run lint
```

### Testing

The project includes comprehensive test coverage:

- **Unit tests**: Test individual components and services
- **Integration tests**: End-to-end functionality testing
- **Contract tests**: CLI interface and file format validation
- **Performance tests**: Large export handling (1000+ messages)

Total: 144+ tests across all test suites

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test && npm run lint`
4. Submit a pull request

## Support

For issues and feature requests, please use the GitHub issue tracker.

