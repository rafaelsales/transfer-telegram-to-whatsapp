# Data Model: Telegram to WhatsApp CLI Tool

## Core Entities

### TelegramMessage
Represents a message from Telegram's result.json export format.

```typescript
interface TelegramMessage {
  id: number;
  type: 'message' | 'service';
  date: string; // ISO 8601 format
  date_unixtime: string;
  from?: string; // Sender name (optional for service messages)
  from_id?: string; // Sender ID (optional for service messages)
  
  // Text content
  text: string;
  text_entities: TextEntity[];
  
  // Media content
  photo?: string; // Relative file path
  photo_file_size?: number;
  width?: number;
  height?: number;
  file?: string; // For documents/voice messages
  file_size?: number;
  media_type?: 'voice_message' | 'video_message' | 'document';
  mime_type?: string;
  duration_seconds?: number; // For audio/video
  
  // Message relationships
  reply_to_message_id?: number;
  forwarded_from?: string;
  
  // Message state
  edited?: string; // ISO 8601 format
  edited_unixtime?: string;
  
  // Reactions
  reactions?: Reaction[];
  
  // Service message data
  actor?: string;
  actor_id?: string;
  action?: string; // create_group, edit_group_title, etc.
  title?: string;
  members?: string[];
}

interface TextEntity {
  type: 'plain' | 'bold' | 'italic' | 'code' | 'pre' | 'link' | 'mention';
  text: string;
  href?: string; // For links
}

interface Reaction {
  type: 'emoji';
  count: number;
  emoji: string;
  recent: ReactionUser[];
}

interface ReactionUser {
  from: string;
  from_id: string;
  date: string;
}
```

**Validation Rules**:
- `id` must be unique within export
- `date` must be valid ISO 8601 timestamp
- `type` must be 'message' or 'service'
- Media files referenced in `photo`/`file` must exist in export folder

### WhatsAppMessage
Represents a message ready for WhatsApp import.

```typescript
interface WhatsAppMessage {
  id: string; // Generated UUID
  telegramId: number; // Reference to original Telegram message
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  
  // Content
  content: string; // Text content or media caption
  mediaPath?: string; // Absolute path to media file
  mediaType?: string; // MIME type
  
  // Metadata
  timestamp: number; // Unix timestamp in milliseconds
  sender: string; // Original sender name from Telegram
  
  // WhatsApp-specific fields
  chatId: string; // WhatsApp chat/contact ID
  quotedMessage?: string; // For replies
  
  // Processing state
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  errorMessage?: string;
  sentAt?: number; // Unix timestamp when sent
}
```

**Validation Rules**:
- `id` must be unique UUID
- `telegramId` must reference existing TelegramMessage
- `timestamp` must be valid Unix timestamp
- `mediaPath` must exist if `type` is not 'text'
- `status` transitions: pending → processing → (sent|failed|skipped)

### ImportPlan
Contains the complete execution plan for WhatsApp import.

```typescript
interface ImportPlan {
  version: string; // Schema version (1.0.0)
  metadata: PlanMetadata;
  messages: WhatsAppMessage[];
  skippedMessages: SkippedMessage[];
  statistics: ImportStatistics;
}

interface PlanMetadata {
  generatedAt: string; // ISO 8601 timestamp
  telegramExportPath: string; // Original export folder path
  outputPath: string; // Output folder path
  totalMessages: number;
  supportedMessages: number;
  skippedMessages: number;
  mediaFiles: number;
}

interface SkippedMessage {
  telegramId: number;
  reason: 'service_message' | 'unsupported_media' | 'poll_message' | 'community_feature' | 'missing_file';
  originalMessage: TelegramMessage;
  explanation: string;
}

interface ImportStatistics {
  messageTypes: Record<string, number>; // Count by type
  mediaTypes: Record<string, number>; // Count by media type
  totalSize: number; // Total media size in bytes
  dateRange: {
    earliest: string; // ISO 8601
    latest: string; // ISO 8601
  };
}
```

**Validation Rules**:
- `version` must follow semantic versioning
- `messages` array must be sorted by timestamp
- All `telegramId` references must be valid
- Statistics must match actual message counts

### ProgressRecord
Tracks execution progress for idempotent imports.

```typescript
interface ProgressRecord {
  messageId: string; // WhatsApp message UUID
  telegramId: number; // Original Telegram message ID
  status: 'sent' | 'failed';
  timestamp: number; // Unix timestamp of attempt
  errorMessage?: string; // If status is 'failed'
  retryCount: number; // Number of retry attempts
  sentMessageId?: string; // WhatsApp's message ID (if available)
}

interface ProgressSummary {
  planPath: string; // Path to import plan file
  startedAt: string; // ISO 8601 timestamp
  lastUpdated: string; // ISO 8601 timestamp
  totalMessages: number;
  processedMessages: number;
  successfulMessages: number;
  failedMessages: number;
  currentPosition: number; // Index in messages array
  status: 'running' | 'completed' | 'failed' | 'paused';
}
```

**State Transitions**:
```
pending → processing → sent (success path)
pending → processing → failed → processing (retry path)
```

### Configuration
CLI and runtime configuration settings.

```typescript
interface CLIConfig {
  // Rate limiting
  sleepRange: {
    min: number; // Minimum seconds between messages
    max: number; // Maximum seconds between messages
  };
  
  // Connection settings
  whatsappTimeout: number; // Connection timeout in ms
  maxRetries: number; // Max retry attempts per message
  
  // File handling
  maxFileSize: number; // Maximum file size in bytes
  supportedMediaTypes: string[]; // Allowed MIME types
  
  // Output settings
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  outputFormat: 'json' | 'human';
}

interface RuntimeState {
  whatsappClient: any; // WhatsApp client instance
  currentPlan?: ImportPlan;
  currentProgress?: ProgressSummary;
  rateLimiter: {
    lastMessageTime: number;
    messageCount: number;
    dailyLimit: number;
  };
}
```

## Data Flow and Relationships

### Import Plan Generation Flow
```
TelegramExport (folder) 
  → parse result.json 
  → validate TelegramMessages 
  → filter supported messages 
  → transform to WhatsAppMessages 
  → create ImportPlan 
  → save to output folder
```

### Import Execution Flow
```
ImportPlan (JSON file) 
  → load WhatsAppMessages 
  → check ProgressRecords 
  → filter unprocessed messages 
  → execute with rate limiting 
  → update ProgressRecords 
  → complete or resume
```

### File Structure Mapping
```
Input: /path/to/ChatExport_2025-09-07/
├── result.json           → TelegramMessage[]
├── photos/              → MediaFile references
├── voice_messages/      → MediaFile references
└── ...

Output: /path/to/ChatExport_2025-09-07-WhatsAppExportOutput/
├── import-plan.json     → ImportPlan
├── skipped-messages.json → SkippedMessage[]
├── progress.json        → ProgressSummary
└── progress.jsonl       → ProgressRecord[] (append-only)
```

## Validation and Constraints

### File System Constraints
- All file paths must be absolute or relative to export folder
- Media files must exist before plan generation
- Output folder must be writable
- Progress files must support concurrent access

### WhatsApp Constraints
- Message rate: 3-10 second delays (configurable)
- File size limits: 16MB for photos/videos, 100MB for documents
- Daily message limits: Start at 250-1000 messages per 24 hours
- Supported media types: jpeg, png, gif, mp4, mov, pdf, doc, etc.

### Memory and Performance
- Stream processing for large exports (1000+ messages)
- Lazy loading of media files
- Progress tracking prevents memory accumulation
- JSON streaming for large plan files

### Data Integrity
- Atomic writes for progress updates
- Schema validation on all JSON files
- Referential integrity between messages and media
- Backup and recovery for interrupted imports

This data model supports the complete lifecycle from Telegram export parsing through WhatsApp import execution, with robust error handling and progress tracking throughout.