# Telegram to WhatsApp CLI Tool

A Node.js command-line tool for importing Telegram chat exports to WhatsApp with rate limiting, progress tracking, and resume functionality.

## Features

- Import Telegram chat exports (result.json format) to WhatsApp
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

```bash
npm install -g telegram-to-whatsapp
```

Or run locally:

```bash
git clone <repository-url>
cd move-telegram-to-whatsapp
npm install
```

## Usage

The tool works in two phases: **plan** generation and **execution**.

### 1. Generate Import Plan

First, create an import plan from your Telegram export:

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
- Estimated import time: ~2.5 hours
```

### 2. Execute Import

Execute the import plan to WhatsApp:

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

To find the target chat ID:

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
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test && npm run lint`
4. Submit a pull request

## Support

For issues and feature requests, please use the GitHub issue tracker.