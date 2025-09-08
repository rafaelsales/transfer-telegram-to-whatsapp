# Quickstart Guide: Telegram to WhatsApp CLI Tool

This guide walks through the complete process of importing a Telegram chat export into WhatsApp.

## Prerequisites

- Node.js 18+ installed
- WhatsApp account with web access enabled
- Telegram chat export folder (created via Telegram Desktop/Mobile)
- ~10-15 minutes for the complete process

## Quick Start (5 minutes)

### 1. Install the CLI Tool
```bash
npm install -g telegram-to-whatsapp
```

### 2. Prepare Your Telegram Export
Export your chat from Telegram Desktop:
1. Open Telegram Desktop
2. Go to Settings → Advanced → Export Telegram data
3. Select the chat to export
4. Choose "All time" period and include media
5. Wait for export to complete (creates a folder like `ChatExport_2025-09-07`)

### 3. Generate Import Plan
```bash
telegram-to-whatsapp plan ./ChatExport_2025-09-07
```

**Expected output:**
```
✓ Parsed Telegram export: ChatExport_2025-09-07
✓ Found 245 messages (198 supported, 47 skipped)
✓ Validated 156 media files (total: 1.2GB)
✓ Generated import plan: ./ChatExport_2025-09-07-WhatsAppExportOutput/

Next steps:
  1. Review the import plan: cat import-plan.json
  2. Execute import: telegram-to-whatsapp execute ./ChatExport_2025-09-07-WhatsAppExportOutput/
```

### 4. Review the Plan (Optional)
```bash
cd ChatExport_2025-09-07-WhatsAppExportOutput
cat import-plan.json | jq '.metadata'
cat skipped-messages.json | jq '.[] | .reason' | sort | uniq -c
```

### 5. Execute WhatsApp Import
```bash
telegram-to-whatsapp execute ./ChatExport_2025-09-07-WhatsAppExportOutput/ \
  --target-chat "1234567890@c.us"
```

**First run will show QR code:**
```
📱 WhatsApp Authentication Required
Scan this QR code with WhatsApp on your phone:
[QR CODE DISPLAY]
Waiting for authentication...
```

**After authentication:**
```
✓ WhatsApp client connected
✓ Loaded import plan: 198 messages to send

Progress: [████████████████████████████████████████] 100%
Sent: 198/198 messages (0 failed)
✓ Import completed successfully
```

Done! Your Telegram messages are now in WhatsApp.

## Detailed Walkthrough

### Understanding Your Telegram Export

When you export from Telegram, you get a folder structure like:
```
ChatExport_2025-09-07/
├── result.json          # Main message data
├── photos/             # Image files  
├── voice_messages/     # Voice recordings
├── video_files/        # Video files
└── files/              # Documents and other files
```

The CLI tool reads `result.json` and processes all referenced media files.

### Plan Generation Deep Dive

The plan command analyzes your export and creates three key files:

#### 1. Import Plan (`import-plan.json`)
Contains messages ready for WhatsApp import:
```json
{
  "version": "1.0.0",
  "metadata": {
    "totalMessages": 245,
    "supportedMessages": 198,
    "skippedMessages": 47,
    "mediaFiles": 156
  },
  "messages": [...],
  "statistics": {...}
}
```

#### 2. Skipped Messages (`skipped-messages.json`)
Shows what couldn't be imported and why:
```json
[
  {
    "telegramId": 12345,
    "reason": "service_message",
    "explanation": "Group creation messages are not supported by WhatsApp"
  },
  {
    "telegramId": 12346, 
    "reason": "poll_message",
    "explanation": "Poll messages are not supported by whatsapp-web.js"
  }
]
```

Common skip reasons:
- `service_message`: Group management actions (name changes, member adds/removes)
- `poll_message`: Telegram polls (not supported in WhatsApp)
- `missing_file`: Referenced media file doesn't exist
- `unsupported_media`: Media type not supported by WhatsApp

#### 3. Generation Summary
The command shows a summary of what was processed:
- **Total messages**: Everything in the Telegram export
- **Supported**: Messages that will be imported to WhatsApp
- **Skipped**: Messages that can't be imported (see reasons above)
- **Media files**: Photos, videos, voice messages, documents

### Import Execution Deep Dive

The execute command processes your plan with these features:

#### Rate Limiting
By default, waits 3-10 seconds between messages (randomized):
```bash
# Custom timing (faster)
telegram-to-whatsapp execute ./output/ --sleep 1-5 --target-chat "..."

# Custom timing (slower) 
telegram-to-whatsapp execute ./output/ --sleep 5-20 --target-chat "..."
```

#### Progress Tracking  
Creates two progress files:
- `progress.json`: Overall summary and current position
- `progress.jsonl`: Detailed log of each message (append-only)

#### Resumable Imports
If interrupted (network issues, crashes), simply re-run:
```bash
telegram-to-whatsapp execute ./output/ --target-chat "..."
```
It automatically resumes from the last successful message.

#### Dry Run Mode
Test your import plan without sending messages:
```bash
telegram-to-whatsapp execute ./output/ --dry-run --target-chat "..."
```

### Finding Your WhatsApp Chat ID

You need the WhatsApp chat ID (format: `1234567890@c.us`). Options:

#### Option 1: Use WhatsApp Web Inspector
1. Open WhatsApp Web in browser
2. Open the target chat
3. Press F12 (Developer Tools)
4. Look for chat ID in the URL or page source

#### Option 2: Create a Test Chat
1. Create a new WhatsApp group
2. Add only yourself
3. Use that group's ID for testing

#### Option 3: CLI Helper (Future Enhancement)
```bash
# Planned feature
telegram-to-whatsapp list-chats
```

### File Size and Media Handling

WhatsApp has strict limits:
- **Photos/Videos**: 16MB maximum
- **Documents**: 100MB maximum  
- **Supported formats**: JPEG, PNG, GIF, MP4, MOV, PDF, DOC, etc.

The tool automatically:
- Validates file sizes during plan generation
- Skips oversized files (logged in skipped-messages.json)
- Preserves original quality (no re-encoding)

### Error Handling and Recovery

Common issues and solutions:

#### WhatsApp Authentication Failed
```
Error: WhatsApp authentication failed - scan QR code required
```
**Solution**: Delete session data and re-authenticate:
```bash
rm -rf ~/.telegram-to-whatsapp/session/
telegram-to-whatsapp execute ...
```

#### Rate Limit Exceeded  
```
Error: WhatsApp daily message limit exceeded (1000/1000)
```
**Solution**: Wait 24 hours or increase delays:
```bash
telegram-to-whatsapp execute ./output/ --sleep 10-30 --target-chat "..."
```

#### Connection Lost During Import
```
Error: WhatsApp connection lost
```
**Solution**: The tool auto-retries. If it fails completely, just re-run the same command.

#### Target Chat Not Found
```  
Error: Target chat not found: 1234567890@c.us
```
**Solution**: Verify the chat ID is correct and accessible.

## Advanced Usage

### Custom Configuration File

Create `~/.telegram-to-whatsapp.json`:
```json
{
  "default_sleep_range": "5-15",
  "log_level": "debug", 
  "max_retries": 5,
  "whatsapp_timeout_ms": 60000
}
```

### Batch Processing Multiple Exports

```bash
# Process multiple exports
for export in ChatExport_*; do
  echo "Processing $export..."
  telegram-to-whatsapp plan "$export"
  telegram-to-whatsapp execute "${export}-WhatsAppExportOutput/" \
    --target-chat "1234567890@c.us"
done
```

### JSON Output for Automation

```bash
# Get structured output for scripts
telegram-to-whatsapp plan ./export/ --format json > plan-result.json
telegram-to-whatsapp execute ./output/ --format json --target-chat "..." > execution-result.json
```

## Troubleshooting

### Check Tool Version
```bash
telegram-to-whatsapp --version
```

### Enable Debug Logging
```bash
telegram-to-whatsapp plan ./export/ --log-level debug
```

### Validate Your Export Manually
```bash
# Check result.json exists and is valid
file ./ChatExport_2025-09-07/result.json
jq '.messages | length' ./ChatExport_2025-09-07/result.json

# Check for missing media files
find ./ChatExport_2025-09-07/ -name "*.jpg" -o -name "*.mp4" -o -name "*.ogg" | wc -l
```

### Clean Start
```bash
# Remove all session and progress data
rm -rf ~/.telegram-to-whatsapp/
rm -rf ./ChatExport_*-WhatsAppExportOutput/progress.*
```

## Performance Tips

### Large Exports (1000+ Messages)
- Use slower rate limits: `--sleep 5-20`
- Run during off-peak hours
- Monitor progress with `tail -f progress.jsonl`
- Split very large exports if needed

### Media-Heavy Exports
- Ensure stable internet connection
- Consider running overnight
- Monitor disk space (media files are copied, not moved)

### Multiple WhatsApp Accounts
- Use different session directories
- Set `TELEGRAM_TO_WHATSAPP_DATA_DIR` environment variable:
```bash
TELEGRAM_TO_WHATSAPP_DATA_DIR=/path/to/account1 telegram-to-whatsapp execute ...
TELEGRAM_TO_WHATSAPP_DATA_DIR=/path/to/account2 telegram-to-whatsapp execute ...
```

That's it! You should now be able to successfully import your Telegram chat history into WhatsApp.