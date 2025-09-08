# CLI Interface Contract

## Command Structure

### Base Command
```bash
telegram-to-whatsapp [options] <command> [command-options]
```

**Global Options:**
- `--version, -v`: Show version number
- `--help, -h`: Show help information
- `--format <format>`: Output format (json|human) [default: human]
- `--log-level <level>`: Log level (error|warn|info|debug) [default: info]

## Commands

### 1. Plan Generation Command

```bash
telegram-to-whatsapp plan <telegram-export-path> [options]
```

**Purpose**: Parse Telegram export and generate WhatsApp import plan

**Arguments:**
- `<telegram-export-path>`: Path to Telegram export folder containing result.json

**Options:**
- `--output, -o <path>`: Custom output folder path [default: auto-generated]
- `--validate-media`: Validate all media files exist [default: false]
- `--skip-large-files`: Skip files exceeding size limits instead of failing [default: false]

**Success Output (human format):**
```
✓ Parsed Telegram export: ChatExport_2025-09-07
✓ Found 245 messages (198 supported, 47 skipped)
✓ Validated 156 media files (total: 1.2GB)
✓ Generated import plan: ./ChatExport_2025-09-07-WhatsAppExportOutput/

Files created:
  - import-plan.json (198 messages ready for import)
  - skipped-messages.json (47 unsupported messages)

Next steps:
  1. Review the import plan: cat import-plan.json
  2. Execute import: telegram-to-whatsapp execute ./ChatExport_2025-09-07-WhatsAppExportOutput/
```

**Success Output (json format):**
```json
{
  "status": "success",
  "input_path": "/path/to/ChatExport_2025-09-07",
  "output_path": "/path/to/ChatExport_2025-09-07-WhatsAppExportOutput",
  "statistics": {
    "total_messages": 245,
    "supported_messages": 198,
    "skipped_messages": 47,
    "media_files": 156,
    "total_size_bytes": 1200000000
  },
  "files_created": [
    "import-plan.json",
    "skipped-messages.json"
  ]
}
```

**Error Cases:**
```bash
# Invalid export folder
Exit Code: 1
Error: Telegram export folder not found: /path/to/missing-folder

# Missing result.json
Exit Code: 2  
Error: result.json not found in export folder: /path/to/export

# Invalid result.json format
Exit Code: 3
Error: Invalid result.json format: missing required field 'messages'

# Permission errors
Exit Code: 4
Error: Cannot create output folder: /path/to/output (permission denied)

# Media file validation failures
Exit Code: 5
Error: Media validation failed: 12 files missing from export folder
```

### 2. Import Execution Command

```bash
telegram-to-whatsapp execute <import-plan-path> [options]
```

**Purpose**: Execute WhatsApp import from generated plan

**Arguments:**
- `<import-plan-path>`: Path to folder containing import-plan.json

**Options:**
- `--sleep <range>`: Sleep range between messages in seconds [default: 3-10]
- `--dry-run`: Validate plan without sending messages [default: false]
- `--resume`: Resume from last progress (automatic if progress.json exists)
- `--target-chat <chat-id>`: WhatsApp chat ID to import messages to [required]

**Success Output (human format):**
```
✓ WhatsApp client connected
✓ Loaded import plan: 198 messages to send
✓ Resuming from message 45 (153 remaining)

Progress: [████████████████████████████████████████] 100%
Sent: 198/198 messages (0 failed)
Rate: ~4.2 seconds per message (average)
Total time: 14 minutes 32 seconds

✓ Import completed successfully
✓ Progress saved to: progress.json

Summary:
  - Messages sent: 198
  - Media files uploaded: 156  
  - Skipped messages: 0
  - Failed messages: 0
```

**Success Output (json format):**
```json
{
  "status": "success",
  "execution_summary": {
    "total_messages": 198,
    "sent_messages": 198,
    "failed_messages": 0,
    "skipped_messages": 0,
    "media_files_uploaded": 156,
    "start_time": "2025-09-08T10:00:00Z",
    "end_time": "2025-09-08T10:14:32Z",
    "total_duration_seconds": 872,
    "average_delay_seconds": 4.2
  }
}
```

**Error Cases:**
```bash
# Import plan not found
Exit Code: 10
Error: Import plan not found: /path/to/missing-plan/import-plan.json

# Invalid import plan format
Exit Code: 11
Error: Invalid import plan format: schema validation failed

# WhatsApp connection failure
Exit Code: 12
Error: Failed to connect to WhatsApp after 5 attempts

# WhatsApp authentication failure  
Exit Code: 13
Error: WhatsApp authentication failed - scan QR code required

# Rate limit exceeded
Exit Code: 14
Error: WhatsApp daily message limit exceeded (1000/1000)

# Missing target chat
Exit Code: 15
Error: Target chat ID required: use --target-chat option

# Invalid target chat
Exit Code: 16
Error: Target chat not found or inaccessible: 1234567890@c.us
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | File/folder not found |
| 2 | Missing required files (result.json, import-plan.json) |
| 3 | Invalid file format/schema |
| 4 | File system permission error |
| 5 | Media file validation error |
| 10 | Import plan error |
| 11 | Import plan schema error |
| 12 | WhatsApp connection error |
| 13 | WhatsApp authentication error |
| 14 | WhatsApp rate limit error |
| 15 | Missing required argument |
| 16 | Invalid argument value |
| 99 | Unexpected error |

## Environment Variables

```bash
# Optional configuration
TELEGRAM_TO_WHATSAPP_DATA_DIR=/path/to/data  # Default session storage
TELEGRAM_TO_WHATSAPP_LOG_LEVEL=debug        # Override log level
TELEGRAM_TO_WHATSAPP_MAX_RETRIES=3          # Max retry attempts
```

## Configuration File

Optional `.telegram-to-whatsapp.json` in user home directory:

```json
{
  "default_sleep_range": "3-10",
  "max_file_size_mb": 100,
  "log_level": "info",
  "whatsapp_timeout_ms": 30000,
  "max_retries": 3,
  "supported_media_types": [
    "image/jpeg", "image/png", "image/gif",
    "video/mp4", "video/quicktime",
    "audio/ogg", "audio/mpeg", "audio/wav",
    "application/pdf", "application/msword"
  ]
}
```

## Interactive Features

### QR Code Display
When WhatsApp authentication is required:
```
📱 WhatsApp Authentication Required

Scan this QR code with WhatsApp on your phone:

████ ▄▄▄▄▄▄▄ ▄ ▄▄  ▄ ▄▄▄▄▄▄▄ ████
████ █ ▄▄▄ █ ██▀▄█▀▄ █ ▄▄▄ █ ████
████ █ ███ █ ▀▄▀▀▀█▄ █ ███ █ ████
...

Or visit: https://web.whatsapp.com/ and scan there.

Waiting for authentication... (timeout in 60 seconds)
```

### Progress Display  
Real-time progress during import:
```
Importing messages to WhatsApp...

Progress: [██████████░░░░░░░░░░░░░░░░░░░░] 35% (69/198)
Current: Sending photo_15.jpg (2.3MB)
Rate: 4.1 seconds/message (average)
ETA: 8 minutes 23 seconds

Recent: 
  ✓ Message 67: "Thanks for the update!" 
  ✓ Message 68: voice_message_12.ogg (45s)
  → Message 69: photo_15.jpg (sending...)
```

## Validation Rules

### Input Validation
- Telegram export path must exist and be readable
- result.json must be valid JSON with required schema
- Media file paths must be relative to export folder
- Output folder parent must be writable

### Runtime Validation  
- WhatsApp client must be authenticated before execution
- Sleep range must be positive integers (min < max)
- Target chat must be accessible
- Import plan schema must match expected version

### Progress Validation
- Progress file must be valid JSON Lines format
- Message IDs in progress must match plan
- Progress position must be within plan bounds
- Resume must be from valid checkpoint